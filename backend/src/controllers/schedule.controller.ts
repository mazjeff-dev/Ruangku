import type { Response } from "express";
import type { Prisma, BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parseId } from "../lib/http";
import { DAY_MS, parseJakartaDate } from "../lib/time";
import { jakartaDateKey } from "../lib/time";

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
        attendees: true,
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
  const closures = await prisma.roomClosure.findMany({
    where: {
      startDate: { lte: new Date(`${jakartaDateKey(new Date(toExclusive.getTime() - 1))}T00:00:00.000Z`) },
      endDate: { gte: new Date(`${jakartaDateKey(from)}T00:00:00.000Z`) },
      ...(typeof req.query.roomId === "string" && req.query.roomId
        ? { OR: [{ roomId: parseId(req.query.roomId, "ID ruangan") }, { roomId: null }] }
        : {}),
    },
    include: { room: { select: { id: true, name: true, code: true } } },
    orderBy: { startDate: "asc" },
  });
  const [hours, globalHours] = await Promise.all([
    prisma.roomOperatingHour.findMany({
      where: typeof req.query.roomId === "string" && req.query.roomId
        ? { roomId: parseId(req.query.roomId, "ID ruangan") }
        : undefined,
      orderBy: [{ roomId: "asc" }, { dayOfWeek: "asc" }],
    }),
    prisma.globalOperatingHours.findUnique({ where: { id: 1 } }),
  ]);

  return res.status(200).json({
    success: true,
    message: "Jadwal berhasil diambil",
    data: {
      bookings,
      rooms,
      closures,
      operatingHours: hours,
      globalOperatingHours: globalHours
        ? { ...globalHours, operatingDays: globalHours.operatingDays.split(",").map(Number) }
        : null,
    },
  });
}
