import type { Response } from "express";
import type { Prisma, BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { findConflict, lockRoom } from "../lib/booking";
import { notifyUser } from "../lib/notify";
import { formatJakarta, parseJakartaDate, DAY_MS } from "../lib/time";
import { reviewBookingSchema, adminCancelSchema } from "../validators/booking";

const STATUSES: BookingStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"];

const bookingInclude = {
  room: { select: { id: true, name: true, code: true, location: true } },
  student: { select: { id: true, name: true, email: true, nim: true } },
  reviewer: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;

export async function reviewBooking(
  req: AuthRequest,
  res: Response
) {
  const bookingId = parseId(req.params.id, "ID pengajuan");
  const { status, adminNote } = parse<{ status: "APPROVED" | "REJECTED"; adminNote?: string }>(
    reviewBookingSchema,
    req.body
  );

  const updated = await prisma.$transaction(async (tx) => {
    const found = await tx.booking.findUnique({ where: { id: bookingId } });

    if (!found) throw new HttpError(404, "Pengajuan tidak ditemukan");

    // Kunci ruangan agar persetujuan dua pengajuan yang bertabrakan tidak bisa lolos bersamaan.
    await lockRoom(tx, found.roomId);

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { room: { select: { name: true } } },
    });

    if (booking.status !== "PENDING") {
      throw new HttpError(400, "Pengajuan ini sudah diproses");
    }

    if (status === "APPROVED") {
      const conflict = await findConflict(tx, {
        roomId: booking.roomId,
        start: booking.startTime,
        end: booking.endTime,
        statuses: ["APPROVED"],
        excludeId: bookingId,
      });

      if (conflict) {
        throw new HttpError(409, "Jadwal bentrok dengan peminjaman yang sudah disetujui");
      }

      if (booking.endTime <= new Date()) {
        throw new HttpError(400, "Jadwal peminjaman ini sudah lewat");
      }
    }

    const result = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status,
        adminNote: adminNote || null,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        logs: {
          create: {
            userId: req.user!.userId,
            action: status,
            note: adminNote || `Pengajuan ${status === "APPROVED" ? "disetujui" : "ditolak"}`,
          },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        adminNote: true,
        reviewedAt: true,
      },
    });

    const when = `${formatJakarta(booking.startTime)} WIB`;
    await notifyUser(tx, booking.userId, {
      bookingId,
      type: status === "APPROVED" ? "BOOKING_APPROVED" : "BOOKING_REJECTED",
      title: status === "APPROVED" ? "Peminjaman disetujui" : "Peminjaman ditolak",
      message:
        status === "APPROVED"
          ? `"${booking.title}" di ${booking.room.name} (${when}) telah disetujui.${adminNote ? ` Catatan: ${adminNote}` : ""}`
          : `"${booking.title}" di ${booking.room.name} (${when}) ditolak. Alasan: ${adminNote}`,
    });

    return result;
  });

  return res.status(200).json({
    success: true,
    message: status === "APPROVED" ? "Pengajuan berhasil disetujui" : "Pengajuan berhasil ditolak",
    data: updated,
  });
}

/** GET /admin/bookings — filter: status, roomId, userId, from, to, q; paginasi: page, pageSize. */
export async function getAllBookings(
  req: AuthRequest,
  res: Response
) {
  const q = req.query;
  const where: Prisma.BookingWhereInput = {};

  if (typeof q.status === "string" && q.status) {
    if (!STATUSES.includes(q.status as BookingStatus)) throw new HttpError(400, "Filter status tidak valid");
    where.status = q.status as BookingStatus;
  }
  if (typeof q.roomId === "string" && q.roomId) where.roomId = parseId(q.roomId, "ID ruangan");
  if (typeof q.userId === "string" && q.userId) where.userId = parseId(q.userId, "ID mahasiswa");

  const range: Prisma.DateTimeFilter = {};
  if (typeof q.from === "string" && q.from) {
    const from = parseJakartaDate(q.from);
    if (!from) throw new HttpError(400, "Format tanggal 'from' harus YYYY-MM-DD");
    range.gte = from;
  }
  if (typeof q.to === "string" && q.to) {
    const to = parseJakartaDate(q.to);
    if (!to) throw new HttpError(400, "Format tanggal 'to' harus YYYY-MM-DD");
    range.lt = new Date(to.getTime() + DAY_MS);
  }
  if (range.gte || range.lt) where.startTime = range;

  if (typeof q.q === "string" && q.q.trim()) {
    const term = q.q.trim();
    where.OR = [
      { title: { contains: term } },
      { student: { name: { contains: term } } },
      { student: { nim: { contains: term } } },
      { room: { name: { contains: term } } },
    ];
  }

  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: bookingInclude,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.status(200).json({
    success: true,
    message: "Daftar semua pengajuan berhasil diambil",
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    data: bookings,
  });
}

/** GET /admin/bookings/:id — detail lengkap + riwayat perubahan status. */
export async function getBookingDetail(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID pengajuan");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      ...bookingInclude,
      room: { select: { id: true, name: true, code: true, location: true, capacity: true, facilities: true, imageUrl: true } },
      logs: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          action: true,
          note: true,
          createdAt: true,
          user: { select: { id: true, name: true, role: true } },
        },
      },
    },
  });

  if (!booking) throw new HttpError(404, "Pengajuan tidak ditemukan");

  return res.status(200).json({
    success: true,
    message: "Detail pengajuan berhasil diambil",
    data: booking,
  });
}

/** PATCH /admin/bookings/:id/cancel — admin membatalkan pengajuan PENDING/APPROVED yang belum selesai. */
export async function cancelBookingByAdmin(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID pengajuan");
  const { reason } = parse<{ reason: string }>(adminCancelSchema, req.body);

  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id },
      include: { room: { select: { name: true } } },
    });

    if (!booking) throw new HttpError(404, "Pengajuan tidak ditemukan");

    if (booking.status !== "PENDING" && booking.status !== "APPROVED") {
      throw new HttpError(400, "Hanya pengajuan PENDING atau APPROVED yang bisa dibatalkan");
    }
    if (booking.endTime <= new Date()) {
      throw new HttpError(400, "Peminjaman ini sudah selesai dan tidak bisa dibatalkan");
    }

    const updated = await tx.booking.update({
      where: { id },
      data: {
        status: "CANCELLED",
        adminNote: reason,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        logs: {
          create: {
            userId: req.user!.userId,
            action: "CANCELLED",
            note: `Dibatalkan oleh admin: ${reason}`,
          },
        },
      },
      select: { id: true, title: true, status: true, adminNote: true },
    });

    await notifyUser(tx, booking.userId, {
      bookingId: id,
      type: "BOOKING_CANCELLED",
      title: "Peminjaman dibatalkan admin",
      message: `"${booking.title}" di ${booking.room.name} (${formatJakarta(booking.startTime)} WIB) dibatalkan. Alasan: ${reason}`,
    });

    return updated;
  });

  return res.status(200).json({
    success: true,
    message: "Peminjaman berhasil dibatalkan",
    data: result,
  });
}
