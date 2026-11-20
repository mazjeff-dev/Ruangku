import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Agregasi laporan admin/dosen dilakukan di database (bukan memuat semua baris ke memori).
 * Semua angka dinormalisasi dengan Number() karena driver mengembalikan BigInt/Decimal untuk COUNT/SUM.
 */
export interface ReportAggregateInput {
  from: Date;
  toExclusive: Date;
  /** Bila diisi, hanya ruangan yang ditugaskan kepada dosen ini. */
  lecturerId?: number;
}

const USED = Prisma.sql`b.status IN ('APPROVED', 'COMPLETED')`;
const HOURS = Prisma.sql`TIMESTAMPDIFF(MICROSECOND, b.startTime, b.endTime) / 3600000000`;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function aggregateReport({ from, toExclusive, lecturerId }: ReportAggregateInput) {
  const scope = lecturerId
    ? Prisma.sql`AND b.roomId IN (SELECT rl.roomId FROM RoomLecturer rl WHERE rl.userId = ${lecturerId})`
    : Prisma.empty;
  const period = Prisma.sql`b.startTime >= ${from} AND b.startTime < ${toExclusive} ${scope}`;

  const [statusRows, totalsRows, roomRows, studentRows, categoryRows, dailyRows] = await Promise.all([
    prisma.$queryRaw<Array<{ status: string; n: bigint | number }>>`
      SELECT b.status AS status, COUNT(*) AS n FROM Booking b WHERE ${period} GROUP BY b.status`,
    prisma.$queryRaw<Array<{ bookings: bigint | number; attendees: unknown; hours: unknown; activeUsers: bigint | number }>>`
      SELECT COUNT(*) AS bookings,
        SUM(COALESCE(b.attendees, 0)) AS attendees,
        SUM(CASE WHEN ${USED} THEN ${HOURS} ELSE 0 END) AS hours,
        COUNT(DISTINCT b.userId) AS activeUsers
      FROM Booking b WHERE ${period}`,
    prisma.$queryRaw<Array<{ id: number; name: string; code: string; category: string | null; bookings: bigint | number; attendees: unknown; hours: unknown }>>`
      SELECT r.id AS id, r.name AS name, r.code AS code, r.category AS category,
        COUNT(b.id) AS bookings,
        SUM(COALESCE(b.attendees, 0)) AS attendees,
        SUM(CASE WHEN ${USED} THEN ${HOURS} ELSE 0 END) AS hours
      FROM Booking b JOIN Room r ON r.id = b.roomId
      WHERE ${period}
      GROUP BY r.id, r.name, r.code, r.category
      ORDER BY bookings DESC, hours DESC, r.id ASC
      LIMIT 10`,
    prisma.$queryRaw<Array<{ id: number; name: string; nim: string | null; bookings: bigint | number; attendees: unknown; approved: unknown; hours: unknown }>>`
      SELECT u.id AS id, u.name AS name, u.nim AS nim,
        COUNT(b.id) AS bookings,
        SUM(COALESCE(b.attendees, 0)) AS attendees,
        SUM(CASE WHEN ${USED} THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN ${USED} THEN ${HOURS} ELSE 0 END) AS hours
      FROM Booking b JOIN User u ON u.id = b.userId
      WHERE ${period}
      GROUP BY u.id, u.name, u.nim
      ORDER BY bookings DESC, u.id ASC
      LIMIT 10`,
    prisma.$queryRaw<Array<{ category: string | null; bookings: bigint | number }>>`
      SELECT r.category AS category, COUNT(*) AS bookings
      FROM Booking b JOIN Room r ON r.id = b.roomId
      WHERE ${period}
      GROUP BY r.category`,
    prisma.$queryRaw<Array<{ day: string; bookings: bigint | number }>>`
      SELECT DATE_FORMAT(DATE_ADD(b.startTime, INTERVAL 7 HOUR), '%Y-%m-%d') AS day, COUNT(*) AS bookings
      FROM Booking b WHERE ${period}
      GROUP BY day ORDER BY day ASC`,
  ]);

  const byStatus: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, COMPLETED: 0, NO_SHOW: 0 };
  for (const row of statusRows) byStatus[row.status] = num(row.n);

  const totals = totalsRows[0];
  const categories = new Map<string, number>();
  for (const row of categoryRows) {
    const name = row.category ?? "Tanpa kategori";
    categories.set(name, (categories.get(name) ?? 0) + num(row.bookings));
  }

  return {
    byStatus,
    totalBookings: num(totals?.bookings),
    totalAttendees: num(totals?.attendees),
    totalHours: round1(num(totals?.hours)),
    activeUsers: num(totals?.activeUsers),
    topRooms: roomRows.map((r) => ({
      id: r.id, name: r.name, code: r.code, category: r.category,
      bookings: num(r.bookings), attendees: num(r.attendees), hours: round1(num(r.hours)),
    })),
    topStudents: studentRows.map((s) => ({
      id: s.id, name: s.name, nim: s.nim,
      bookings: num(s.bookings), attendees: num(s.attendees), approved: num(s.approved), hours: round1(num(s.hours)),
    })),
    byCategory: [...categories.entries()].map(([name, bookings]) => ({ name, bookings })).sort((a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name)),
    daily: dailyRows.map((d) => ({ date: d.day, bookings: num(d.bookings) })),
  };
}
