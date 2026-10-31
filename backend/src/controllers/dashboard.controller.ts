import type { Response } from "express";
import type { Prisma, BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError } from "../lib/http";
import {
  DAY_MS,
  jakartaDateKey,
  jakartaMonthKey,
  parseJakartaDate,
  startOfJakartaMonth,
  startOfNextJakartaMonth,
} from "../lib/time";

const STATUSES: BookingStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"];
const MAX_RANGE_DAYS = 366;

/**
 * GET /admin/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&status=PENDING
 * Rentang tanggal memakai tanggal MULAI peminjaman (WIB). Default: bulan berjalan.
 * Semua angka dihitung langsung dari database.
 */
export async function getDashboard(req: AuthRequest, res: Response) {
  const { from: fromQ, to: toQ, status: statusQ } = req.query;

  let from = startOfJakartaMonth();
  let toExclusive = startOfNextJakartaMonth();

  if (typeof fromQ === "string" && fromQ) {
    const parsed = parseJakartaDate(fromQ);
    if (!parsed) throw new HttpError(400, "Format tanggal 'from' harus YYYY-MM-DD");
    from = parsed;
  }
  if (typeof toQ === "string" && toQ) {
    const parsed = parseJakartaDate(toQ);
    if (!parsed) throw new HttpError(400, "Format tanggal 'to' harus YYYY-MM-DD");
    toExclusive = new Date(parsed.getTime() + DAY_MS);
  }
  if (toExclusive <= from) throw new HttpError(400, "Tanggal akhir harus setelah tanggal awal");
  if ((toExclusive.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new HttpError(400, `Rentang maksimal ${MAX_RANGE_DAYS} hari`);
  }

  let statusFilter: BookingStatus | undefined;
  if (typeof statusQ === "string" && statusQ) {
    if (!STATUSES.includes(statusQ as BookingStatus)) throw new HttpError(400, "Filter status tidak valid");
    statusFilter = statusQ as BookingStatus;
  }

  const now = new Date();
  const rangeWhere: Prisma.BookingWhereInput = { startTime: { gte: from, lt: toExclusive } };
  const filteredWhere: Prisma.BookingWhereInput = { ...rangeWhere, ...(statusFilter ? { status: statusFilter } : {}) };

  const [
    roomsTotal,
    roomsActive,
    roomsAvailable,
    inUseNow,
    statusGroups,
    chartRows,
    recentLogs,
    upcoming,
    studentsTotal,
    studentsActive,
  ] = await Promise.all([
    prisma.room.count(),
    prisma.room.count({ where: { isActive: true } }),
    prisma.room.count({ where: { isActive: true, isAvailable: true } }),
    prisma.booking.findMany({
      where: { status: "APPROVED", startTime: { lte: now }, endTime: { gt: now } },
      distinct: ["roomId"],
      select: { roomId: true },
    }),
    prisma.booking.groupBy({ by: ["status"], where: rangeWhere, _count: { _all: true } }),
    prisma.booking.findMany({ where: filteredWhere, select: { startTime: true, status: true } }),
    prisma.bookingLog.findMany({
      where: { booking: filteredWhere },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        note: true,
        createdAt: true,
        user: { select: { id: true, name: true, role: true } },
        booking: { select: { id: true, title: true, status: true, room: { select: { name: true } } } },
      },
    }),
    prisma.booking.findMany({
      where: { status: "APPROVED", startTime: { gt: now } },
      orderBy: { startTime: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        room: { select: { name: true, code: true } },
        student: { select: { name: true } },
      },
    }),
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.user.count({ where: { role: "STUDENT", isActive: true } }),
  ]);

  const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const g of statusGroups) byStatus[g.status] = g._count._all;
  const bookingsTotal = Object.values(byStatus).reduce((a, b) => a + b, 0);

  // Grafik: harian bila rentang <= 62 hari, selain itu bulanan (kunci tanggal WIB).
  const spanDays = Math.round((toExclusive.getTime() - from.getTime()) / DAY_MS);
  const granularity = spanDays <= 62 ? "day" : "month";
  const empty = () => ({ total: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, COMPLETED: 0 });
  const buckets = new Map<string, ReturnType<typeof empty>>();

  for (let t = from.getTime(); t < toExclusive.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const key = granularity === "day" ? jakartaDateKey(d) : jakartaMonthKey(d);
    if (!buckets.has(key)) buckets.set(key, empty());
  }
  for (const row of chartRows) {
    const key = granularity === "day" ? jakartaDateKey(row.startTime) : jakartaMonthKey(row.startTime);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    bucket[row.status] += 1;
  }

  return res.status(200).json({
    success: true,
    message: "Data dashboard berhasil diambil",
    data: {
      filter: {
        from: jakartaDateKey(from),
        to: jakartaDateKey(new Date(toExclusive.getTime() - DAY_MS)),
        status: statusFilter ?? null,
      },
      rooms: {
        total: roomsTotal,
        active: roomsActive,
        inactive: roomsTotal - roomsActive,
        available: roomsAvailable,
        unavailable: roomsTotal - roomsAvailable,
        inUseNow: inUseNow.length,
      },
      bookings: {
        total: bookingsTotal,
        pending: byStatus.PENDING,
        approved: byStatus.APPROVED,
        rejected: byStatus.REJECTED,
        cancelled: byStatus.CANCELLED,
        completed: byStatus.COMPLETED,
      },
      students: { total: studentsTotal, active: studentsActive },
      chart: {
        granularity,
        points: [...buckets.entries()].map(([date, counts]) => ({ date, ...counts })),
      },
      recentActivity: recentLogs,
      upcoming,
    },
  });
}
