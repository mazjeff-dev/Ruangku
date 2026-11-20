import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { HttpError } from "./http";
import { JAKARTA_OFFSET_MS, jakartaDateKey } from "./time";

type Db = Prisma.TransactionClient | PrismaClient;

const minutesOf = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

function dayOfWeekJakarta(date: Date) {
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).getUTCDay();
}

function minuteOfDayJakarta(date: Date) {
  const local = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export async function assertRoomSchedule(
  tx: Db,
  roomId: number,
  start: Date,
  end: Date
) {
  const info = await getRoomOperatingInfo(tx, roomId, start);
  validateOperatingHours(start, end, info);
}

export function validateOperatingHours(
  start: Date,
  end: Date,
  info: { openTime: string | null; closeTime: string | null; isClosed: boolean; closures: Array<{ reason: string }> }
) {
  if (jakartaDateKey(start) !== jakartaDateKey(end)) {
    throw new HttpError(400, "Peminjaman yang melintasi tengah malam atau beberapa hari tidak diperbolehkan");
  }
  if (info.closures.length) throw new HttpError(400, `Ruangan ditutup: ${info.closures[0].reason}`);
  if (info.isClosed) {
    throw new HttpError(400, "Ruangan tutup pada hari yang dipilih");
  }
  if (info.openTime === null || info.closeTime === null) return;
  const startMinute = minuteOfDayJakarta(start);
  const endMinute = minuteOfDayJakarta(end);
  const openMinute = minutesOf(info.openTime);
  const closeMinute = minutesOf(info.closeTime);
  if (startMinute < openMinute || endMinute > closeMinute) {
    throw new HttpError(
      400,
      `Booking harus berada dalam jam operasional ${info.openTime}–${info.closeTime} WIB`
    );
  }
}

export async function getRoomOperatingInfo(db: Db, roomId: number, date: Date) {
  const day = dayOfWeekJakarta(date);
  const dateKey = jakartaDateKey(date);
  const [override, globalHours, closures] = await Promise.all([
    db.roomOperatingHour.findUnique({ where: { roomId_dayOfWeek: { roomId, dayOfWeek: day } } }),
    db.globalOperatingHours.findUnique({ where: { id: 1 } }),
    db.roomClosure.findMany({
      where: {
        startDate: { lte: new Date(`${dateKey}T00:00:00.000Z`) },
        endDate: { gte: new Date(`${dateKey}T00:00:00.000Z`) },
        OR: [{ roomId }, { roomId: null }],
      },
      orderBy: { startDate: "asc" },
      select: { id: true, reason: true, startDate: true, endDate: true },
    }),
  ]);
  if (override) {
    return {
      dayOfWeek: day,
      openTime: override.openTime,
      closeTime: override.closeTime,
      isClosed: override.isClosed,
      closures,
    };
  }
  if (!globalHours) {
    return { dayOfWeek: day, openTime: null, closeTime: null, isClosed: false, closures };
  }
  return {
    dayOfWeek: day,
    openTime: globalHours.openTime,
    closeTime: globalHours.closeTime,
    isClosed: !globalHours.operatingDays.split(",").map(Number).includes(day),
    closures,
  };
}
