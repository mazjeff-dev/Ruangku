import type { Response } from "express";
import type { ViolationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { getEffectiveBookingRules } from "../lib/rules";
import { lockRoom, promoteWaitingBookings } from "../lib/booking";
import { calculateOverstayMinutes, recalculateUserSanction, recordViolation } from "../lib/violations";
import { formatJakarta } from "../lib/time";
import { attendanceActionSchema, waiveViolationSchema } from "../validators/booking-attendance";
import { notifyAdmins, notifyRoomLecturers, notifyUser } from "../lib/notify";

export async function checkInBooking(req: AuthRequest, res: Response) {
  parse(attendanceActionSchema, req.body ?? {});
  const bookingId = parseId(req.params.id, "ID peminjaman");
  const rules = await getEffectiveBookingRules();
  const now = new Date();
  const booking = await prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!current) throw new HttpError(404, "Peminjaman tidak ditemukan");
    if (current.userId !== req.user!.userId) throw new HttpError(403, "Anda tidak berhak check-in peminjaman ini");
    await lockRoom(tx, current.roomId);
    const locked = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (locked.status !== "APPROVED") throw new HttpError(400, "Check-in hanya tersedia untuk peminjaman yang disetujui");
    if (locked.checkedInAt) throw new HttpError(409, "Check-in untuk peminjaman ini sudah tercatat");
    const earliest = new Date(locked.startTime.getTime() - 10 * 60_000);
    const latest = new Date(locked.startTime.getTime() + rules.gracePeriodMinutes * 60_000);
    if (now < earliest || now > latest) {
      throw new HttpError(400, `Check-in hanya dapat dilakukan ${formatJakarta(earliest)}–${formatJakarta(latest)} WIB`);
    }
    return tx.booking.update({
      where: { id: bookingId },
      data: {
        checkedInAt: now,
        attendanceRequired: true,
        logs: { create: { userId: req.user!.userId, action: "CHECKED_IN", note: "Check-in peminjaman tercatat" } },
      },
      select: { id: true, checkedInAt: true, startTime: true, endTime: true, status: true },
    });
  });
  return res.status(200).json({ success: true, message: "Check-in berhasil dicatat", data: booking });
}

export async function checkOutBooking(req: AuthRequest, res: Response) {
  parse(attendanceActionSchema, req.body ?? {});
  const bookingId = parseId(req.params.id, "ID peminjaman");
  const rules = await getEffectiveBookingRules();
  const now = new Date();
  const booking = await prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!current) throw new HttpError(404, "Peminjaman tidak ditemukan");
    if (current.userId !== req.user!.userId) throw new HttpError(403, "Anda tidak berhak check-out peminjaman ini");
    await lockRoom(tx, current.roomId);
    const locked = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { room: { select: { name: true } } },
    });
    if (!locked || locked.status !== "APPROVED") throw new HttpError(400, "Peminjaman ini tidak dapat di-check-out");
    if (!locked.checkedInAt) throw new HttpError(400, "Lakukan check-in sebelum check-out");
    if (locked.checkedOutAt) throw new HttpError(409, "Check-out untuk peminjaman ini sudah tercatat");
    const overstayMinutes = calculateOverstayMinutes(locked.endTime, now);
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "COMPLETED",
        checkedOutAt: now,
        overstayMinutes,
        logs: {
          create: {
            userId: req.user!.userId,
            action: "CHECKED_OUT",
            note: overstayMinutes ? `Check-out terlambat ${overstayMinutes} menit` : "Check-out tercatat tepat waktu",
          },
        },
      },
      select: { id: true, status: true, checkedInAt: true, checkedOutAt: true, overstayMinutes: true },
    });
    if (overstayMinutes > 0) {
      await recordViolation(tx, {
        userId: locked.userId,
        bookingId,
        type: "OVERSTAY",
        points: rules.overstayPoints,
        reason: `Check-out terlambat ${overstayMinutes} menit untuk "${locked.title}".`,
        now,
      }, rules);
    } else {
      await notifyUser(tx, locked.userId, {
        bookingId,
        type: "BOOKING_APPROVED",
        title: "Check-out berhasil",
        message: `Check-out peminjaman "${locked.title}" di ${locked.room.name} berhasil dicatat.`,
      });
    }
    const notification = {
      bookingId,
      type: "BOOKING_APPROVED" as const,
      title: "Ruangan telah dikosongkan",
      message: `"${locked.title}" di ${locked.room.name} telah di-check-out.`,
    };
    await Promise.all([notifyAdmins(tx, notification), notifyRoomLecturers(tx, locked.roomId, notification)]);
    await promoteWaitingBookings(tx, locked.roomId);
    return updated;
  });
  return res.status(200).json({ success: true, message: "Check-out berhasil dicatat", data: booking });
}

export async function getMyViolations(req: AuthRequest, res: Response) {
  const [rules, user, points] = await Promise.all([
    getEffectiveBookingRules(),
    prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: { bookingBlockedUntil: true },
    }),
    prisma.violationPoint.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        booking: { select: { id: true, title: true, startTime: true, room: { select: { name: true } } } },
        waiver: { select: { name: true } },
      },
    }),
  ]);
  const totalPoints = points.reduce((sum, point) => sum + (point.waivedAt ? 0 : point.points), 0);
  return res.status(200).json({
    success: true,
    data: {
      totalPoints,
      blockedUntil: user.bookingBlockedUntil,
      rules: {
        noShowPoints: rules.noShowPoints,
        overstayPoints: rules.overstayPoints,
        lateCancelPoints: rules.lateCancelPoints,
        suspendThreshold: rules.suspendThreshold,
        suspendDays: rules.suspendDays,
        gracePeriodMinutes: rules.gracePeriodMinutes,
        lateCancelWindowMinutes: rules.lateCancelWindowMinutes,
      },
      points,
    },
  });
}

export async function getUserViolationsForAdmin(req: AuthRequest, res: Response) {
  const userId = parseId(req.params.userId, "ID pengguna");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, bookingBlockedUntil: true } });
  if (!user || (user.role !== "STUDENT" && user.role !== "DOSEN")) throw new HttpError(404, "Pengguna tidak ditemukan");
  const points = await prisma.violationPoint.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { booking: { select: { id: true, title: true, startTime: true, room: { select: { id: true, name: true } } } } },
  });
  return res.status(200).json({
    success: true,
    data: { user, totalPoints: points.reduce((sum, point) => sum + (point.waivedAt ? 0 : point.points), 0), points },
  });
}

export async function getAssignedUserViolations(req: AuthRequest, res: Response) {
  const userId = parseId(req.params.userId, "ID pengguna");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || user.role !== "STUDENT") throw new HttpError(404, "Mahasiswa tidak ditemukan");
  const assignment = await prisma.roomLecturer.findFirst({
    where: {
      userId: req.user!.userId,
      room: { bookings: { some: { userId } } },
    },
    select: { roomId: true },
  });
  if (!assignment) throw new HttpError(403, "Mahasiswa ini tidak memiliki peminjaman di ruangan tugas Anda");
  const points = await prisma.violationPoint.findMany({
    where: { userId, booking: { room: { lecturers: { some: { userId: req.user!.userId } } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { booking: { select: { id: true, title: true, startTime: true, room: { select: { id: true, name: true } } } } },
  });
  return res.status(200).json({ success: true, data: { points, totalPoints: points.reduce((sum, point) => sum + (point.waivedAt ? 0 : point.points), 0) } });
}

export async function waiveViolation(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID poin pelanggaran");
  const { note } = parse<{ note: string }>(waiveViolationSchema, req.body);
  const rules = await getEffectiveBookingRules();
  const result = await prisma.$transaction(async (tx) => {
    const point = await tx.violationPoint.findUnique({ where: { id } });
    if (!point) throw new HttpError(404, "Poin pelanggaran tidak ditemukan");
    if (point.waivedAt) throw new HttpError(409, "Poin pelanggaran ini sudah dibatalkan");
    const waived = await tx.violationPoint.update({
      where: { id },
      data: { waivedBy: req.user!.userId, waivedAt: new Date(), waivedNote: note },
      include: { booking: { select: { id: true } } },
    });
    await tx.bookingLog.create({
      data: {
        bookingId: point.bookingId,
        userId: req.user!.userId,
        action: "VIOLATION_WAIVED",
        note: `Poin pelanggaran #${id} dibatalkan: ${note}`,
      },
    });
    const totalPoints = await recalculateUserSanction(tx, point.userId, point.bookingId, rules.suspendThreshold);
    await notifyUser(tx, point.userId, {
      bookingId: point.bookingId,
      type: "VIOLATION_RECORDED",
      title: "Poin pelanggaran ditinjau",
      message: `Poin pelanggaran "${point.reason}" dibatalkan oleh administrator. Catatan: ${note}. Total poin aktif: ${totalPoints}.`,
    });
    return waived;
  });
  return res.status(200).json({ success: true, message: "Poin pelanggaran berhasil dibatalkan", data: result });
}
