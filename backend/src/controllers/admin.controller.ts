
import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";

export async function reviewBooking(
  req: AuthRequest,
  res: Response
) {
  try {
    const bookingId = Number(req.params.id);
    const { status, adminNote } = req.body;

    if (!Number.isInteger(bookingId) || bookingId < 1) {
      return res.status(400).json({
        success: false,
        message: "ID pengajuan tidak valid",
      });
    }

    if (status !== "APPROVED" && status !== "REJECTED") {
      return res.status(400).json({
        success: false,
        message: "Status harus APPROVED atau REJECTED",
      });
    }

    if (
      adminNote !== undefined &&
      (typeof adminNote !== "string" || adminNote.length > 2000)
    ) {
      return res.status(400).json({
        success: false,
        message: "Catatan admin tidak valid",
      });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Pengajuan tidak ditemukan",
      });
    }

    if (booking.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Pengajuan ini sudah diproses",
      });
    }

    if (status === "APPROVED") {
      const conflictingBooking = await prisma.booking.findFirst({
        where: {
          id: { not: bookingId },
          roomId: booking.roomId,
          status: "APPROVED",
          startTime: { lt: booking.endTime },
          endTime: { gt: booking.startTime },
        },
      });

      if (conflictingBooking) {
        return res.status(409).json({
          success: false,
          message: "Jadwal bentrok dengan peminjaman yang sudah disetujui",
        });
      }
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        adminNote: adminNote?.trim() || null,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        logs: {
          create: {
            userId: req.user!.userId,
            action: status,
            note: adminNote?.trim() || `Pengajuan ${status.toLowerCase()}`,
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

    return res.status(200).json({
      success: true,
      message:
        status === "APPROVED"
          ? "Pengajuan berhasil disetujui"
          : "Pengajuan berhasil ditolak",
      data: updatedBooking,
    });
  } catch (error) {
    console.error("Review booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}


export async function getAllBookings(
  _req: AuthRequest,
  res: Response
) {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            nim: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Daftar semua pengajuan berhasil diambil",
      total: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error("Gagal mengambil semua pengajuan:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}
