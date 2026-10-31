import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { findConflict, lockRoom } from "../lib/booking";
import { notifyAdmins } from "../lib/notify";
import { formatJakarta } from "../lib/time";
import { createBookingSchema } from "../validators/booking";

export async function createBooking(
  req: AuthRequest,
  res: Response
) {
  const input = parse<{
    roomId: number;
    title: string;
    purpose: string;
    startTime: Date;
    endTime: Date;
  }>(createBookingSchema, req.body);

  if (input.startTime <= new Date()) {
    throw new HttpError(400, "Waktu mulai harus di masa depan");
  }

  const booking = await prisma.$transaction(async (tx) => {
    // Kunci ruangan, lalu cek bentrok dan simpan dalam satu transaksi.
    await lockRoom(tx, input.roomId);

    const room = await tx.room.findUnique({ where: { id: input.roomId } });

    if (!room || !room.isActive || !room.isAvailable) {
      throw new HttpError(404, "Ruangan tidak ditemukan atau tidak tersedia");
    }

    const conflict = await findConflict(tx, {
      roomId: room.id,
      start: input.startTime,
      end: input.endTime,
      statuses: ["PENDING", "APPROVED"],
    });

    if (conflict) {
      throw new HttpError(409, "Jadwal ruangan bentrok dengan pengajuan lain");
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

    await notifyAdmins(tx, {
      bookingId: created.id,
      type: "BOOKING_SUBMITTED",
      title: "Pengajuan peminjaman baru",
      message: `${student.name} mengajukan ${room.name} untuk "${created.title}" pada ${formatJakarta(created.startTime)} WIB.`,
    });

    return created;
  });

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

  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { room: { select: { name: true } }, student: { select: { name: true } } },
    });

    if (!booking) {
      throw new HttpError(404, "Pengajuan peminjaman tidak ditemukan");
    }

    if (booking.userId !== req.user!.userId) {
      throw new HttpError(403, "Kamu tidak berhak membatalkan pengajuan ini");
    }

    if (booking.status !== "PENDING") {
      throw new HttpError(400, "Hanya pengajuan berstatus PENDING yang bisa dibatalkan");
    }

    const cancelled = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        logs: {
          create: {
            userId: req.user!.userId,
            action: "CANCELLED",
            note: "Pengajuan dibatalkan oleh mahasiswa",
          },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    await notifyAdmins(tx, {
      bookingId,
      type: "BOOKING_CANCELLED",
      title: "Pengajuan dibatalkan mahasiswa",
      message: `${booking.student.name} membatalkan pengajuan "${booking.title}" (${booking.room.name}).`,
    });

    return cancelled;
  });

  return res.status(200).json({
    success: true,
    message: "Pengajuan berhasil dibatalkan",
    data: result,
  });
}
