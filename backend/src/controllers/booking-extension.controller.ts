import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { findConflict, lockRoom } from "../lib/booking";
import { notifyAdmins, notifyRoomLecturers, notifyUser } from "../lib/notify";
import { formatJakarta } from "../lib/time";
import { getEffectiveBookingRules } from "../lib/rules";
import { requestExtensionSchema, reviewExtensionSchema } from "../validators/booking-extension";
import { assertRoomSchedule } from "../lib/operating-hours";

export async function requestBookingExtension(req: AuthRequest, res: Response) {
  const bookingId = parseId(req.params.id, "ID peminjaman");
  const { requestedEndTime } = parse<{ requestedEndTime: Date }>(requestExtensionSchema, req.body);
  const bookingRules = await getEffectiveBookingRules();

  const extension = await prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!current || current.userId !== req.user!.userId) throw new HttpError(404, "Peminjaman tidak ditemukan");
    await lockRoom(tx, current.roomId);
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { room: { select: { name: true } } },
    });
    const now = new Date();
    if (booking.status !== "APPROVED" || booking.endTime <= now) {
      throw new HttpError(400, "Perpanjangan hanya dapat diajukan untuk peminjaman yang disetujui dan belum selesai");
    }
    if (requestedEndTime <= booking.endTime) throw new HttpError(400, "Waktu selesai baru harus setelah waktu selesai saat ini");
    if (requestedEndTime <= now) throw new HttpError(400, "Waktu selesai baru harus di masa depan");
    if (requestedEndTime.getTime() - booking.endTime.getTime() > bookingRules.maxHours * 3_600_000) {
      throw new HttpError(400, `Perpanjangan maksimal ${bookingRules.maxHours} jam`);
    }
    await assertRoomSchedule(tx, booking.roomId, booking.startTime, requestedEndTime);

    const pending = await tx.bookingExtension.findFirst({
      where: { bookingId, status: "PENDING" },
      select: { id: true },
    });
    if (pending) throw new HttpError(409, "Sudah ada pengajuan perpanjangan yang menunggu keputusan");

    const conflict = await findConflict(tx, {
      roomId: booking.roomId,
      start: booking.endTime,
      end: requestedEndTime,
      statuses: ["PENDING", "APPROVED"],
      excludeId: bookingId,
    });
    if (conflict) throw new HttpError(409, "Perpanjangan bertabrakan dengan jadwal lain");

    const created = await tx.bookingExtension.create({
      data: { bookingId, requestedBy: req.user!.userId, requestedEndTime },
      include: { booking: { select: { id: true, title: true, room: { select: { name: true } } } } },
    });
    const message = `Permintaan perpanjangan "${booking.title}" di ${booking.room.name} hingga ${formatJakarta(requestedEndTime)} WIB.`;
    const notification = {
      bookingId,
      title: "Permintaan perpanjangan peminjaman",
      message,
    };
    await Promise.all([
      notifyAdmins(tx, { ...notification, type: "BOOKING_EXTENSION_REQUESTED" }),
      notifyRoomLecturers(tx, booking.roomId, { ...notification, type: "BOOKING_EXTENSION_REQUESTED" }),
    ]);
    return created;
  });

  return res.status(201).json({ success: true, message: "Permintaan perpanjangan berhasil diajukan", data: extension });
}

export async function listBookingExtensions(req: AuthRequest, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : "PENDING";
  if (!["PENDING", "APPROVED", "REJECTED", "ALL"].includes(status)) throw new HttpError(400, "Filter status tidak valid");
  const where = {
    ...(status === "ALL" ? {} : { status: status as "PENDING" | "APPROVED" | "REJECTED" }),
    ...(req.user!.role === "DOSEN" ? {
      requestedBy: { not: req.user!.userId },
      booking: { room: { lecturers: { some: { userId: req.user!.userId } } } },
    } : {}),
  };
  const data = await prisma.bookingExtension.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      requester: { select: { id: true, name: true, email: true, nim: true } },
      booking: { include: { room: { select: { id: true, name: true, code: true, location: true } } } },
      reviewer: { select: { id: true, name: true, role: true } },
    },
  });
  return res.status(200).json({ success: true, message: "Daftar perpanjangan berhasil diambil", total: data.length, data });
}

export async function reviewBookingExtension(req: AuthRequest, res: Response) {
  const extensionId = parseId(req.params.id, "ID perpanjangan");
  const { status, note } = parse<{ status: "APPROVED" | "REJECTED"; note?: string }>(reviewExtensionSchema, req.body);
  const bookingRules = await getEffectiveBookingRules();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.bookingExtension.findUnique({
      where: { id: extensionId },
      include: { booking: { select: { id: true, roomId: true } } },
    });
    if (!current) throw new HttpError(404, "Permintaan perpanjangan tidak ditemukan");
    if (req.user!.role === "DOSEN") {
      if (current.requestedBy === req.user!.userId) throw new HttpError(403, "Dosen tidak dapat meninjau perpanjangan milik sendiri");
      const assignment = await tx.roomLecturer.findUnique({
        where: { roomId_userId: { roomId: current.booking.roomId, userId: req.user!.userId } },
        select: { roomId: true },
      });
      if (!assignment) throw new HttpError(403, "Anda tidak ditugaskan pada ruangan ini");
    }

    await lockRoom(tx, current.booking.roomId);
    const extension = await tx.bookingExtension.findUniqueOrThrow({
      where: { id: extensionId },
      include: {
        booking: { include: { room: { select: { name: true } } } },
      },
    });
    if (extension.status !== "PENDING") throw new HttpError(400, "Permintaan perpanjangan ini sudah diproses");
    if (extension.booking.status !== "APPROVED" || extension.booking.endTime <= new Date()) {
      throw new HttpError(400, "Peminjaman sudah selesai atau tidak lagi disetujui");
    }

    if (status === "APPROVED") {
      if (extension.requestedEndTime.getTime() - extension.booking.endTime.getTime() > bookingRules.maxHours * 3_600_000) {
        throw new HttpError(400, `Perpanjangan maksimal ${bookingRules.maxHours} jam`);
      }
      await assertRoomSchedule(tx, extension.booking.roomId, extension.booking.startTime, extension.requestedEndTime);
      const conflict = await findConflict(tx, {
        roomId: extension.booking.roomId,
        start: extension.booking.endTime,
        end: extension.requestedEndTime,
        statuses: ["PENDING", "APPROVED"],
        excludeId: extension.bookingId,
      });
      if (conflict) throw new HttpError(409, "Slot perpanjangan sudah dipakai pengajuan lain");
      await tx.booking.update({
        where: { id: extension.bookingId },
        data: {
          endTime: extension.requestedEndTime,
          logs: { create: { userId: req.user!.userId, action: "EXTENSION_APPROVED", note: note ?? "Perpanjangan disetujui" } },
        },
      });
    }

    const reviewed = await tx.bookingExtension.update({
      where: { id: extensionId },
      data: { status, note: note ?? null, reviewedBy: req.user!.userId, reviewedAt: new Date() },
    });
    await notifyUser(tx, extension.requestedBy, {
      bookingId: extension.bookingId,
      type: status === "APPROVED" ? "BOOKING_EXTENSION_APPROVED" : "BOOKING_EXTENSION_REJECTED",
      title: status === "APPROVED" ? "Perpanjangan disetujui" : "Perpanjangan ditolak",
      message: status === "APPROVED"
        ? `Peminjaman "${extension.booking.title}" diperpanjang hingga ${formatJakarta(extension.requestedEndTime)} WIB.${note ? ` Catatan: ${note}` : ""}`
        : `Perpanjangan "${extension.booking.title}" ditolak.${note ? ` Alasan: ${note}` : ""}`,
    });
    return reviewed;
  });
  return res.status(200).json({
    success: true,
    message: status === "APPROVED" ? "Perpanjangan berhasil disetujui" : "Perpanjangan berhasil ditolak",
    data: result,
  });
}
