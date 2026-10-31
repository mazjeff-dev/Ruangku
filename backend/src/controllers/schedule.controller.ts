import type { Response } from "express";
import type { Prisma, BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parseId } from "../lib/http";
import { DAY_MS, parseJakartaDate } from "../lib/time";

const SCHEDULE_STATUSES: BookingStatus[] = ["PENDING", "APPROVED", "COMPLETED"];

/**
 * GET /admin/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD&roomId=
 * Mengembalikan peminjaman yang beririsan dengan rentang tanggal untuk tampilan kalender
 * (hari / minggu / bulan ditentukan oleh frontend lewat rentang from–to).
 */
export async function getSchedule(req: AuthRequest, res: Response) {
  const from = parseJakartaDate(String(req.query.from ?? ""));
  const to = parseJakartaDate(String(req.query.to ?? ""));
  if (!from || !to) throw new HttpError(400, "Parameter 'from' dan 'to' wajib berformat YYYY-MM-DD");

  const toExclusive = new Date(to.getTime() + DAY_MS);
  if (toExclusive <= from) throw new HttpError(400, "Tanggal akhir harus setelah tanggal awal");
  if ((toExclusive.getTime() - from.getTime()) / DAY_MS > 93) throw new HttpError(400, "Rentang maksimal 93 hari");

  const where: Prisma.BookingWhereInput = {
    status: { in: SCHEDULE_STATUSES },
    startTime: { lt: toExclusive },
    endTime: { gt: from },
  };
  if (typeof req.query.roomId === "string" && req.query.roomId) where.roomId = parseId(req.query.roomId, "ID ruangan");

  const [bookings, rooms] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
        room: { select: { id: true, name: true, code: true } },
        student: { select: { id: true, name: true, nim: true } },
      },
    }),
    prisma.room.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, capacity: true, isAvailable: true },
    }),
  ]);

  return res.status(200).json({
    success: true,
    message: "Jadwal berhasil diambil",
    data: { bookings, rooms },
  });
}
