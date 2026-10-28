
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";

export async function createBooking(
  req: AuthRequest,
  res: Response
) {
  try {
    const { roomId, title, purpose, startTime, endTime } = req.body;

    if (
      roomId === undefined ||
      !title ||
      !purpose ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Semua data peminjaman wajib diisi",
      });
    }

    if (
      !Number.isInteger(Number(roomId)) ||
      Number(roomId) < 1 ||
      typeof title !== "string" ||
      typeof purpose !== "string" ||
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      !title.trim() ||
      !purpose.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Format data peminjaman tidak valid",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return res.status(400).json({
        success: false,
        message: "Waktu selesai harus setelah waktu mulai",
      });
    }

    if (start <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Waktu mulai harus di masa depan",
      });
    }

    const conflictingBooking = await prisma.booking.findFirst({
        where: {
            roomId: Number(roomId),
            status: {
                in: ["PENDING", "APPROVED"],
            },
            startTime: {
                lt: end,
            },
            endTime: {
                gt: start,
            },
        },
    });

    if (conflictingBooking) {
        return res.status(409).json({
            success: false,
            message: "Jadwal ruangan bentrok dengan pengajuan lain",
        });
    }

    const room = await prisma.room.findUnique({
      where: { id: Number(roomId) },
    });

    if (!room || !room.isAvailable) {
      return res.status(404).json({
        success: false,
        message: "Ruangan tidak ditemukan atau tidak tersedia",
      });
    }

    const booking = await prisma.booking.create({
      data: {
        userId: req.user!.userId,
        roomId: room.id,
        title: title.trim(),
        purpose: purpose.trim(),
        startTime: start,
        endTime: end,
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

    return res.status(201).json({
      success: true,
      message: "Pengajuan peminjaman berhasil dibuat",
      data: booking,
    });
  } catch (error) {
    console.error("Create booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
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
  try {
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId < 1) {
      return res.status(400).json({
        success: false,
        message: "ID pengajuan tidak valid",
      });
    }

    const booking = await prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Pengajuan peminjaman tidak ditemukan",
      });
    }

    if (booking.userId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        message: "Kamu tidak berhak membatalkan pengajuan ini",
      });
    }

    if (booking.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Hanya pengajuan berstatus PENDING yang bisa dibatalkan",
      });
    }

    const cancelledBooking = await prisma.booking.update({
      where: {
        id: bookingId,
      },
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

    return res.status(200).json({
      success: true,
      message: "Pengajuan berhasil dibatalkan",
      data: cancelledBooking,
    });
  } catch (error) {
    console.error("Cancel booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}
