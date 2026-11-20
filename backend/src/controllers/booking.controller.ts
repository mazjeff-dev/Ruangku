import type { Response } from "express";
import type { Prisma } from "@prisma/client";
import { getEffectiveBookingRules } from "../lib/rules";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { findConflict, lockRoom, promoteWaitingBookings } from "../lib/booking";
import { notifyAdmins, notifyRoomLecturers, notifyUser } from "../lib/notify";
import { formatJakarta } from "../lib/time";
import { assertRoomSchedule } from "../lib/operating-hours";
import { assertAttendeeCapacity } from "../lib/booking-policy";
import { assertBookingNotBlocked, assertBookingQuota, getUserBookingQuota, lockUserQuota } from "../lib/booking-quota";
import { recordViolation } from "../lib/violations";
import { createBookingSchema } from "../validators/booking";

const bookingSelect = {
  id: true,
  title: true,
  purpose: true,
  startTime: true,
  endTime: true,
  status: true,
  attendees: true,
  checkedInAt: true,
  checkedOutAt: true,
  overstayMinutes: true,
  attendanceRequired: true,
  adminNote: true,
  createdAt: true,
  room: { select: { id: true, name: true, code: true, location: true, imageUrl: true } },
} satisfies Prisma.BookingSelect;

export async function createBooking(
  req: AuthRequest,
  res: Response
) {
  const rules = await getEffectiveBookingRules();
  const input = parse<{
    roomId: number;
    title: string;
    purpose: string;
    attendees: number;
    startTime: Date;
    endTime: Date;
  }>(createBookingSchema(rules), req.body);

  if (input.startTime <= new Date()) {
    throw new HttpError(400, "Waktu mulai harus di masa depan");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Kunci ruangan, lalu cek bentrok dan simpan dalam satu transaksi.
    await lockRoom(tx, input.roomId);
    await lockUserQuota(tx, req.user!.userId);

    const room = await tx.room.findUnique({ where: { id: input.roomId } });

    if (!room || !room.isActive || !room.isAvailable) {
      throw new HttpError(404, "Ruangan tidak ditemukan atau tidak tersedia");
    }
    assertAttendeeCapacity(input.attendees, room.capacity);
    await assertRoomSchedule(tx, room.id, input.startTime, input.endTime);
    await assertBookingNotBlocked(tx, req.user!.userId);
    assertBookingQuota(await getUserBookingQuota(tx, req.user!.userId, rules));

    const conflict = await findConflict(tx, {
      roomId: room.id,
      start: input.startTime,
      end: input.endTime,
      statuses: ["PENDING", "APPROVED"],
    });

    if (conflict) {
      await tx.roomDemandLog.create({
        data: {
          roomId: room.id,
          userId: req.user!.userId,
          startTime: input.startTime,
          endTime: input.endTime,
        },
      });
      return { conflict: true as const };
    }

    const student = await tx.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: { name: true },
    });

    const created = await tx.booking.create({
      data: {
        userId: req.user!.userId,
        roomId: room.id,
        title: input.title,
        purpose: input.purpose,
        startTime: input.startTime,
        endTime: input.endTime,
        attendees: input.attendees,
        attendanceRequired: true,
        status: "PENDING",
        logs: {
          create: {
            userId: req.user!.userId,
            action: "CREATED",
            note: "Pengajuan peminjaman dibuat",
          },
        },
      },
      select: {
        id: true,
        title: true,
        purpose: true,
        startTime: true,
        endTime: true,
        attendees: true,
        checkedInAt: true,
        checkedOutAt: true,
        overstayMinutes: true,
        status: true,
        room: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    const notification = {
      bookingId: created.id,
      type: "BOOKING_SUBMITTED",
      title: "Pengajuan peminjaman baru",
      message: `${student.name} mengajukan ${room.name} untuk "${created.title}" pada ${formatJakarta(created.startTime)} WIB.`,
    } as const;
    await Promise.all([
      notifyUser(tx, req.user!.userId, {
        bookingId: created.id,
        type: "BOOKING_SUBMITTED",
        title: "Pengajuan peminjaman diterima",
        message: `Pengajuan "${created.title}" di ${room.name} untuk ${created.attendees} peserta pada ${formatJakarta(created.startTime)} WIB telah diterima dan menunggu persetujuan.`,
      }),
      notifyAdmins(tx, notification),
      notifyRoomLecturers(tx, room.id, notification),
    ]);

    return { conflict: false as const, booking: created };
  });

  if (result.conflict) throw new HttpError(409, "Jadwal ruangan bentrok dengan pengajuan lain");
  const booking = result.booking;
  return res.status(201).json({
    success: true,
    message: "Pengajuan peminjaman berhasil dibuat",
    data: booking,
  });
}


export async function getMyBookings(
  req: AuthRequest,
  res: Response
) {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        userId: req.user!.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
        purpose: true,
        startTime: true,
        endTime: true,
        attendees: true,
        checkedInAt: true,
        checkedOutAt: true,
        overstayMinutes: true,
        status: true,
        adminNote: true,
        createdAt: true,
        room: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Daftar pengajuan berhasil diambil",
      total: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error("Get bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}


export async function cancelBooking(
  req: AuthRequest,
  res: Response
) {
  const bookingId = parseId(req.params.id, "ID pengajuan");
  const rules = await getEffectiveBookingRules();

  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!found) throw new HttpError(404, "Pengajuan peminjaman tidak ditemukan");
    if (found.userId !== req.user!.userId) throw new HttpError(403, "Kamu tidak berhak membatalkan pengajuan ini");
    await lockRoom(tx, found.roomId);
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { room: { select: { name: true } }, student: { select: { name: true } } },
    });
    if (!booking) throw new HttpError(404, "Pengajuan peminjaman tidak ditemukan");
    if (booking.status !== "PENDING" && booking.status !== "APPROVED") {
      throw new HttpError(400, "Hanya peminjaman PENDING atau APPROVED yang dapat dibatalkan");
    }
    if (booking.startTime <= new Date()) {
      throw new HttpError(400, "Peminjaman yang sudah dimulai tidak dapat dibatalkan");
    }

    const cancelled = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        logs: {
          create: {
            userId: req.user!.userId,
            action: "CANCELLED",
            note: "Peminjaman dibatalkan oleh pemilik",
          },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });
    const minutesUntilStart = (booking.startTime.getTime() - Date.now()) / 60_000;
    if (minutesUntilStart <= rules.lateCancelWindowMinutes) {
      await recordViolation(tx, {
        userId: booking.userId,
        bookingId,
        type: "LATE_CANCEL",
        points: rules.lateCancelPoints,
        reason: `Peminjaman "${booking.title}" dibatalkan kurang dari ${rules.lateCancelWindowMinutes} menit sebelum mulai.`,
      }, rules);
    }

    const notification = {
      bookingId,
      type: "BOOKING_CANCELLED",
      title: "Peminjaman dibatalkan pemilik",
      message: `${booking.student.name} membatalkan "${booking.title}" (${booking.room.name}).`,
    } as const;
    await Promise.all([
      notifyAdmins(tx, notification),
      notifyRoomLecturers(tx, booking.roomId, notification),
      notifyUser(tx, booking.userId, {
        bookingId,
        type: "BOOKING_CANCELLED",
        title: "Peminjaman dibatalkan",
        message: `Peminjaman "${booking.title}" di ${booking.room.name} telah dibatalkan.`,
      }),
    ]);
    await promoteWaitingBookings(tx, booking.roomId);

    return cancelled;
  });

  return res.status(200).json({
    success: true,
    message: "Pengajuan berhasil dibatalkan",
    data: result,
  });
}

const BOOKING_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;

/** GET /bookings/rules — aturan durasi peminjaman (dipakai aplikasi mobile untuk validasi form). */
export async function getBookingRules(_req: AuthRequest, res: Response) {
  const rules = await getEffectiveBookingRules();
  return res.status(200).json({ success: true, data: rules });
}

/** GET /bookings/quota — kuota booking dan antrean aktif milik pengguna login. */
export async function getMyBookingQuota(req: AuthRequest, res: Response) {
  const rules = await getEffectiveBookingRules();
  const quota = await getUserBookingQuota(prisma, req.user!.userId, rules);
  return res.status(200).json({ success: true, data: quota });
}

/** GET /bookings (alias /students/bookings) — peminjaman milik sendiri, filter status + paginasi + ringkasan. */
export async function listMyBookings(req: AuthRequest, res: Response) {
  const userId = req.user!.userId;
  const where: Prisma.BookingWhereInput = { userId };

  if (typeof req.query.status === "string" && req.query.status) {
    if (!(BOOKING_STATUSES as readonly string[]).includes(req.query.status)) {
      throw new HttpError(400, "Filter status tidak valid");
    }
    where.status = req.query.status as (typeof BOOKING_STATUSES)[number];
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const [total, data, groups] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: bookingSelect,
    }),
    prisma.booking.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
  ]);

  const summary: Record<string, number> = { total: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, COMPLETED: 0 };
  for (const g of groups) {
    summary[g.status] = g._count._all;
    summary.total += g._count._all;
  }

  return res.status(200).json({
    success: true,
    message: "Daftar peminjaman berhasil diambil",
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary,
    data,
  });
}

/** GET /bookings/:id — detail peminjaman milik sendiri + riwayat status. */
export async function getMyBookingDetail(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID pengajuan");
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      ...bookingSelect,
      userId: true,
      room: { select: { id: true, name: true, code: true, location: true, imageUrl: true, capacity: true } },
      logs: {
        orderBy: { createdAt: "asc" },
        select: { id: true, action: true, note: true, createdAt: true },
      },
      extensions: {
        orderBy: { createdAt: "desc" },
        select: { id: true, requestedEndTime: true, status: true, note: true, createdAt: true, reviewedAt: true },
      },
    },
  });

  // 404 (bukan 403) untuk milik orang lain, agar keberadaan data tidak bocor
  if (!booking || booking.userId !== req.user!.userId) {
    throw new HttpError(404, "Pengajuan peminjaman tidak ditemukan");
  }
  const { userId: _omit, ...data } = booking;
  return res.status(200).json({ success: true, message: "Detail peminjaman berhasil diambil", data });
}
