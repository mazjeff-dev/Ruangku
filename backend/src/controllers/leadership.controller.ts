import type { Response } from "express";
import { csvCell } from "../lib/csv";
import type { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http";
import { DAY_MS, jakartaDateKey, parseJakartaDate, startOfJakartaMonth, startOfNextJakartaMonth } from "../lib/time";

type RoomMetric = {
  id: number;
  name: string;
  code: string;
  capacity: number;
  operatingHours: number;
  usedHours: number;
  occupancyPercent: number;
  attendeeCapacityRatio: number | null;
  demandCount: number;
  waitingCount: number;
  averageQueueWaitMinutes: number | null;
};

function getOverviewFilters(req: AuthRequest) {
  let from = startOfJakartaMonth();
  let toExclusive = startOfNextJakartaMonth();
  if (typeof req.query.from === "string" && req.query.from) {
    const parsed = parseJakartaDate(req.query.from);
    if (!parsed) throw new HttpError(400, "Format tanggal 'from' harus YYYY-MM-DD");
    from = parsed;
  }
  if (typeof req.query.to === "string" && req.query.to) {
    const parsed = parseJakartaDate(req.query.to);
    if (!parsed) throw new HttpError(400, "Format tanggal 'to' harus YYYY-MM-DD");
    toExclusive = new Date(parsed.getTime() + DAY_MS);
  }
  if (toExclusive <= from) throw new HttpError(400, "Tanggal akhir harus setelah tanggal awal");
  if ((toExclusive.getTime() - from.getTime()) / DAY_MS > 366) throw new HttpError(400, "Rentang maksimal 366 hari");

  const numberFilter = (key: string, defaultValue: number, min: number, max: number) => {
    const value = req.query[key];
    if (value === undefined || value === "") return defaultValue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new HttpError(400, `Filter '${key}' tidak valid`);
    return parsed;
  };
  return {
    from,
    toExclusive,
    lowUsageThreshold: numberFilter("lowUsageThreshold", 20, 0, 100),
    highOccupancyThreshold: numberFilter("highOccupancyThreshold", 80, 1, 100),
    minimumDemand: numberFilter("minimumDemand", 3, 1, 10000),
  };
}

async function loadOverview(req: AuthRequest) {
  const filters = getOverviewFilters(req);
  const fromKey = jakartaDateKey(filters.from);
  const lastDayKey = jakartaDateKey(new Date(filters.toExclusive.getTime() - DAY_MS));
  const [rooms, demandStats, peakHours, userStats, studentStats, eventStats] = await Promise.all([
    prisma.$queryRaw<RoomMetric[]>`
      WITH RECURSIVE calendar(day) AS (
        SELECT STR_TO_DATE(${fromKey}, '%Y-%m-%d')
        UNION ALL
        SELECT DATE_ADD(day, INTERVAL 1 DAY) FROM calendar
        WHERE day < STR_TO_DATE(${lastDayKey}, '%Y-%m-%d')
      ),
      room_hours AS (
        SELECT r.id AS roomId,
          SUM(
            CASE
              WHEN COALESCE(roh.isClosed, 0) = 1 THEN 0
              WHEN roh.id IS NULL AND global_hours.id IS NOT NULL
                AND FIND_IN_SET(
                  CONVERT(CAST(DAYOFWEEK(calendar.day) - 1 AS CHAR) USING binary),
                  CONVERT(global_hours.operatingDays USING binary)
                ) = 0 THEN 0
              WHEN EXISTS (
                SELECT 1 FROM RoomClosure closure
                WHERE (closure.roomId = r.id OR closure.roomId IS NULL)
                  AND DATE(closure.startDate) <= calendar.day AND DATE(closure.endDate) >= calendar.day
              ) THEN 0
              ELSE TIME_TO_SEC(TIMEDIFF(
                COALESCE(roh.closeTime, global_hours.closeTime, '21:00:00'),
                COALESCE(roh.openTime, global_hours.openTime, '07:00:00')
              )) / 3600
            END
          ) AS operatingHours
        FROM Room r
        CROSS JOIN calendar
        LEFT JOIN RoomOperatingHour roh ON roh.roomId = r.id AND roh.dayOfWeek = DAYOFWEEK(calendar.day) - 1
        LEFT JOIN GlobalOperatingHours global_hours ON global_hours.id = 1
        WHERE r.isActive = 1
        GROUP BY r.id
      ),
      room_usage AS (
        SELECT roomId,
          SUM(GREATEST(0, TIMESTAMPDIFF(MICROSECOND, GREATEST(startTime, ${filters.from}), LEAST(endTime, ${filters.toExclusive})) / 3600000000)) AS usedHours
        FROM Booking
        WHERE status IN ('APPROVED', 'COMPLETED') AND startTime < ${filters.toExclusive} AND endTime > ${filters.from}
        GROUP BY roomId
      ),
      attendee_ratio AS (
        SELECT b.roomId,
          SUM(COALESCE(b.attendees, 0)) / NULLIF(SUM(r.capacity), 0) AS attendeeCapacityRatio
        FROM Booking b JOIN Room r ON r.id = b.roomId
        WHERE b.startTime >= ${filters.from} AND b.startTime < ${filters.toExclusive}
          AND b.status IN ('APPROVED', 'COMPLETED')
        GROUP BY b.roomId
      )
      SELECT r.id, r.name, r.code, r.capacity,
        ROUND(COALESCE(room_hours.operatingHours, 0), 2) AS operatingHours,
        ROUND(COALESCE(room_usage.usedHours, 0), 2) AS usedHours,
        ROUND(CASE WHEN COALESCE(room_hours.operatingHours, 0) = 0 THEN 0
          ELSE COALESCE(room_usage.usedHours, 0) / room_hours.operatingHours * 100 END, 1) AS occupancyPercent,
        ROUND(attendee_ratio.attendeeCapacityRatio, 3) AS attendeeCapacityRatio
      FROM Room r
      LEFT JOIN room_hours ON room_hours.roomId = r.id
      LEFT JOIN room_usage ON room_usage.roomId = r.id
      LEFT JOIN attendee_ratio ON attendee_ratio.roomId = r.id
      WHERE r.isActive = 1
      ORDER BY occupancyPercent DESC, r.name ASC
    `,
    prisma.$queryRaw<Array<{ roomId: number; demandCount: number; waitingCount: number; averageQueueWaitMinutes: number | null }>>`
      SELECT r.id AS roomId,
        COALESCE(demand.demandCount, 0) AS demandCount,
        COALESCE(waiting.waitingCount, 0) AS waitingCount,
        waiting.averageQueueWaitMinutes
      FROM Room r
      LEFT JOIN (
        SELECT roomId, COUNT(*) AS demandCount
        FROM RoomDemandLog
        WHERE createdAt >= ${filters.from} AND createdAt < ${filters.toExclusive}
        GROUP BY roomId
      ) demand ON demand.roomId = r.id
      LEFT JOIN (
        SELECT q.roomId,
          SUM(q.status = 'WAITING' AND q.startTime > UTC_TIMESTAMP()) AS waitingCount,
          AVG(CASE WHEN q.status = 'PROMOTED' AND b.createdAt >= ${filters.from} AND b.createdAt < ${filters.toExclusive}
            THEN TIMESTAMPDIFF(SECOND, q.createdAt, b.createdAt) / 60 END) AS averageQueueWaitMinutes
        FROM BookingQueue q
        LEFT JOIN Booking b ON b.id = q.promotedBookingId
        WHERE (q.createdAt >= ${filters.from} AND q.createdAt < ${filters.toExclusive})
          OR q.status = 'WAITING'
        GROUP BY q.roomId
      ) waiting ON waiting.roomId = r.id
      WHERE r.isActive = 1
    `,
    prisma.$queryRaw<Array<{ dayOfWeek: number; hour: number; bookings: number; attendees: number }>>`
      SELECT DAYOFWEEK(DATE_ADD(startTime, INTERVAL 7 HOUR)) - 1 AS dayOfWeek,
        HOUR(DATE_ADD(startTime, INTERVAL 7 HOUR)) AS hour,
        COUNT(*) AS bookings, SUM(COALESCE(attendees, 0)) AS attendees
      FROM Booking
      WHERE startTime >= ${filters.from} AND startTime < ${filters.toExclusive}
        AND status IN ('APPROVED', 'COMPLETED')
      GROUP BY dayOfWeek, hour
      ORDER BY bookings DESC, dayOfWeek ASC, hour ASC
    `,
    prisma.$queryRaw<Array<{ id: number; name: string; email: string; role: string; bookings: number; attendees: number; usedHours: number }>>`
      SELECT u.id, u.name, u.email, u.role,
        COUNT(b.id) AS bookings,
        SUM(COALESCE(b.attendees, 0)) AS attendees,
        ROUND(SUM(CASE WHEN b.status IN ('APPROVED', 'COMPLETED')
          THEN TIMESTAMPDIFF(MICROSECOND, b.startTime, b.endTime) / 3600000000 ELSE 0 END), 1) AS usedHours
      FROM User u
      JOIN Booking b ON b.userId = u.id
      WHERE u.role IN ('STUDENT', 'DOSEN') AND b.startTime >= ${filters.from} AND b.startTime < ${filters.toExclusive}
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY bookings DESC, usedHours DESC
      LIMIT 20
    `,
    prisma.$queryRaw<Array<{ id: number; name: string; nim: string | null; bookings: number; attendees: number; approved: number; hours: number }>>`
      SELECT u.id, u.name, u.nim,
        COUNT(b.id) AS bookings,
        SUM(COALESCE(b.attendees, 0)) AS attendees,
        SUM(b.status IN ('APPROVED', 'COMPLETED')) AS approved,
        ROUND(SUM(CASE WHEN b.status IN ('APPROVED', 'COMPLETED')
          THEN TIMESTAMPDIFF(MICROSECOND, b.startTime, b.endTime) / 3600000000 ELSE 0 END), 1) AS hours
      FROM User u JOIN Booking b ON b.userId = u.id
      WHERE u.role = 'STUDENT' AND b.startTime >= ${filters.from} AND b.startTime < ${filters.toExclusive}
      GROUP BY u.id, u.name, u.nim
      ORDER BY bookings DESC, hours DESC
      LIMIT 10
    `,
    prisma.$queryRaw<Array<{ eligibleBookings: number; noShowBookings: number; completedBookings: number; overstayBookings: number; overstayMinutes: number }>>`
      SELECT SUM(status IN ('APPROVED', 'COMPLETED', 'NO_SHOW')) AS eligibleBookings,
        SUM(status = 'NO_SHOW') AS noShowBookings,
        SUM(status = 'COMPLETED') AS completedBookings,
        SUM(status = 'COMPLETED' AND COALESCE(overstayMinutes, 0) > 0) AS overstayBookings,
        SUM(CASE WHEN status = 'COMPLETED' THEN COALESCE(overstayMinutes, 0) ELSE 0 END) AS overstayMinutes
      FROM Booking
      WHERE startTime >= ${filters.from} AND startTime < ${filters.toExclusive}
    `,
  ]);

  const demandByRoom = new Map(demandStats.map((row) => [row.roomId, row]));
  const roomMetrics = rooms.map((room) => {
    const demand = demandByRoom.get(room.id);
    return {
      ...room,
      operatingHours: Number(room.operatingHours),
      usedHours: Number(room.usedHours),
      occupancyPercent: Number(room.occupancyPercent),
      attendeeCapacityRatio: room.attendeeCapacityRatio === null ? null : Number(room.attendeeCapacityRatio),
      demandCount: Number(demand?.demandCount ?? 0),
      waitingCount: Number(demand?.waitingCount ?? 0),
      averageQueueWaitMinutes: demand?.averageQueueWaitMinutes === null || demand?.averageQueueWaitMinutes === undefined
        ? null
        : Math.round(Number(demand.averageQueueWaitMinutes) * 10) / 10,
    };
  });
  const underusedRooms = roomMetrics.filter((room) => room.operatingHours > 0 && room.occupancyPercent < filters.lowUsageThreshold);
  const frequentlyFullRooms = roomMetrics.filter((room) =>
    room.occupancyPercent >= filters.highOccupancyThreshold &&
    (room.demandCount >= filters.minimumDemand || room.waitingCount > 0)
  );
  const totals = eventStats[0] ?? { eligibleBookings: 0, noShowBookings: 0, completedBookings: 0, overstayBookings: 0, overstayMinutes: 0 };
  const topUsers = userStats.map((user) => ({
    ...user,
    bookings: Number(user.bookings),
    attendees: Number(user.attendees),
    usedHours: Number(user.usedHours),
  }));
  const topStudents = studentStats.map((user) => ({
    ...user,
    bookings: Number(user.bookings),
    attendees: Number(user.attendees),
    approved: Number(user.approved),
    hours: Number(user.hours),
  }));
  const normalizedPeakHours = peakHours.map((slot) => ({
    dayOfWeek: Number(slot.dayOfWeek),
    hour: Number(slot.hour),
    bookings: Number(slot.bookings),
    attendees: Number(slot.attendees),
  }));
  const recommendations = [
    ...frequentlyFullRooms.map((room) => ({
      type: "CAPACITY",
      title: `Evaluasi penambahan kapasitas ${room.name}`,
      reason: `Okupansi ${room.occupancyPercent}% dengan ${room.demandCount} penolakan bentrok dan ${room.waitingCount} antrean aktif.`,
      basis: {
        occupancyPercent: room.occupancyPercent,
        usedHours: room.usedHours,
        operatingHours: room.operatingHours,
        conflictDemandCount: room.demandCount,
        waitingCount: room.waitingCount,
        averageQueueWaitMinutes: room.averageQueueWaitMinutes,
        attendeeCapacityRatio: room.attendeeCapacityRatio,
        thresholds: {
          highOccupancyPercent: filters.highOccupancyThreshold,
          minimumConflictDemand: filters.minimumDemand,
        },
      },
    })),
    ...underusedRooms.map((room) => ({
      type: "REALLOCATION",
      title: `Tinjau pemanfaatan ${room.name}`,
      reason: `Okupansi ${room.occupancyPercent}% berada di bawah ambang ${filters.lowUsageThreshold}%.`,
      basis: {
        occupancyPercent: room.occupancyPercent,
        usedHours: room.usedHours,
        operatingHours: room.operatingHours,
        thresholds: { lowUsagePercent: filters.lowUsageThreshold },
      },
    })),
  ];
  return {
    period: { from: fromKey, to: lastDayKey },
    thresholds: {
      lowUsagePercent: filters.lowUsageThreshold,
      highOccupancyPercent: filters.highOccupancyThreshold,
      minimumConflictDemand: filters.minimumDemand,
    },
    occupancy: roomMetrics,
    underusedRooms,
    frequentlyFullRooms,
    peakHours: normalizedPeakHours,
    capacityRatios: roomMetrics.map(({ id, name, capacity, attendeeCapacityRatio }) => ({ id, name, capacity, attendeeCapacityRatio })),
    topUsers,
    topStudents,
    attendance: {
      totalBookings: Number(totals.eligibleBookings),
      noShowBookings: Number(totals.noShowBookings),
      noShowRatePercent: Number(totals.eligibleBookings) ? Math.round(Number(totals.noShowBookings) / Number(totals.eligibleBookings) * 1000) / 10 : 0,
      completedBookings: Number(totals.completedBookings),
      overstayBookings: Number(totals.overstayBookings),
      overstayRatePercent: Number(totals.completedBookings) ? Math.round(Number(totals.overstayBookings) / Number(totals.completedBookings) * 1000) / 10 : 0,
      overstayMinutes: Number(totals.overstayMinutes),
    },
    recommendations,
  };
}

export async function getLeadershipOverview(req: AuthRequest, res: Response) {
  return res.status(200).json({
    success: true,
    message: "Dasbor pengadaan berhasil diambil",
    data: await loadOverview(req),
  });
}

export async function exportLeadershipOverviewCsv(req: AuthRequest, res: Response) {
  const data = await loadOverview(req);
  const rows: unknown[][] = [
    ["Jenis", "Ruangan / nama", "Okupansi (%)", "Jam terpakai", "Jam operasional", "Demand bentrok", "Antrean", "Waktu tunggu rata-rata (menit)", "Rasio peserta/kapasitas", "Dasar rekomendasi"],
    ...data.occupancy.map((room) => [
      "RUANGAN", room.name, room.occupancyPercent, room.usedHours, room.operatingHours,
      room.demandCount, room.waitingCount, room.averageQueueWaitMinutes, room.attendeeCapacityRatio, "",
    ]),
    ...data.recommendations.map((item) => [
      item.type, item.title, item.basis.occupancyPercent ?? "", item.basis.usedHours ?? "",
      item.basis.operatingHours ?? "", "conflictDemandCount" in item.basis ? item.basis.conflictDemandCount : "",
      "waitingCount" in item.basis ? item.basis.waitingCount : "",
      "averageQueueWaitMinutes" in item.basis ? item.basis.averageQueueWaitMinutes : "",
      "attendeeCapacityRatio" in item.basis ? item.basis.attendeeCapacityRatio : "", item.reason,
    ]),
  ];
  const content = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="dasbor-pengadaan-${data.period.from}_${data.period.to}.csv"`);
  return res.status(200).send(content);
}
