import type { BookingStatus, Prisma } from "@prisma/client";
import { notifyAdmins, notifyRoomLecturers, notifyUser } from "./notify";
import { formatJakarta } from "./time";
import { assertRoomSchedule } from "./operating-hours";
import { HttpError } from "./http";
import { getEffectiveBookingRules } from "./rules";
import { getUserBookingQuota, lockUserQuota } from "./booking-quota";
import { getQueuePositions, notifyChangedQueuePositions, notifyQueueExpired } from "./booking-queue-position";

/**
 * Kunci baris ruangan selama transaksi berjalan, supaya dua permintaan
 * bersamaan untuk ruangan yang sama diproses bergantian (mencegah race condition
 * pada pengecekan jadwal bentrok).
 */
export async function lockRoom(tx: Prisma.TransactionClient, roomId: number) {
  await tx.$queryRaw`SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE`;
}

export function conflictWhere(params: {
  roomId: number;
  start: Date;
  end: Date;
  statuses: BookingStatus[];
  excludeId?: number;
}): Prisma.BookingWhereInput {
  return {
    roomId: params.roomId,
    status: { in: params.statuses },
    startTime: { lt: params.end },
    endTime: { gt: params.start },
    ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
  };
}

/**
 * Logika konflik jadwal:
 *   existing.start < requested.end AND existing.end > requested.start
 */
export function findConflict(
  tx: Prisma.TransactionClient,
  params: {
    roomId: number;
    start: Date;
    end: Date;
    statuses: BookingStatus[];
    excludeId?: number;
  }
) {
  return tx.booking.findFirst({
    where: conflictWhere(params),
    select: { id: true, title: true, startTime: true, endTime: true, status: true },
  });
}

/** Promote the oldest eligible room waitlist entries to pending bookings. */
export async function promoteWaitingBookings(tx: Prisma.TransactionClient, roomId: number) {
  await lockRoom(tx, roomId);
  const now = new Date();
  const previousPositions = await getQueuePositions(tx, roomId);
  const room = await tx.room.findUnique({
    where: { id: roomId },
    select: { isActive: true, isAvailable: true, capacity: true },
  });
  if (!room || !room.isActive || !room.isAvailable) {
    await tx.bookingQueue.updateMany({
      where: { roomId, status: "WAITING" },
      data: { status: "CANCELLED" },
    });
    await notifyChangedQueuePositions(tx, roomId, previousPositions, "ruangan");
    return;
  }
  const expired = await tx.bookingQueue.findMany({
    where: { roomId, status: "WAITING", startTime: { lte: now } },
    include: { room: { select: { name: true } } },
  });
  for (const entry of expired) {
    await tx.bookingQueue.update({ where: { id: entry.id }, data: { status: "CANCELLED" } });
    await notifyQueueExpired(tx, { id: entry.id, userId: entry.userId, title: entry.title, roomName: entry.room.name });
  }

  const waiting = await tx.bookingQueue.findMany({
    where: { roomId, status: "WAITING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { user: { select: { id: true, name: true, isActive: true } }, room: { select: { name: true } } },
  });
  const quotaRules = await getEffectiveBookingRules();

  for (const entry of waiting) {
    if (!entry.user.isActive) {
      await tx.bookingQueue.update({ where: { id: entry.id }, data: { status: "CANCELLED" } });
      continue;
    }
    if (entry.attendees !== null && entry.attendees > room.capacity) {
      await tx.bookingQueue.update({ where: { id: entry.id }, data: { status: "CANCELLED" } });
      continue;
    }
    await lockUserQuota(tx, entry.userId);
    const quota = await getUserBookingQuota(tx, entry.userId, quotaRules, now);
    if (quota.activeBookings >= quota.maxActiveBookings) {
      await tx.bookingQueue.update({ where: { id: entry.id }, data: { status: "CANCELLED" } });
      await notifyUser(tx, entry.userId, {
        type: "BOOKING_CANCELLED",
        title: "Antrean dibatalkan",
        message: `Antrean "${entry.title}" dibatalkan karena Anda telah mencapai batas ${quota.maxActiveBookings} peminjaman aktif.`,
      });
      continue;
    }
    try {
      await assertRoomSchedule(tx, roomId, entry.startTime, entry.endTime);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      await tx.bookingQueue.update({ where: { id: entry.id }, data: { status: "CANCELLED" } });
      continue;
    }

    const conflict = await findConflict(tx, {
      roomId,
      start: entry.startTime,
      end: entry.endTime,
      statuses: ["PENDING", "APPROVED"],
    });
    if (conflict) continue;

    const booking = await tx.booking.create({
      data: {
        userId: entry.userId,
        roomId,
        title: entry.title,
        purpose: entry.purpose,
        startTime: entry.startTime,
        endTime: entry.endTime,
        attendees: entry.attendees,
        attendanceRequired: true,
        status: "PENDING",
        logs: {
          create: {
            userId: entry.userId,
            action: "CREATED",
            note: `Diteruskan dari antrean ruangan #${entry.id}`,
          },
        },
      },
    });
    await tx.bookingQueue.update({
      where: { id: entry.id },
      data: { status: "PROMOTED", promotedBookingId: booking.id },
    });

    const input = {
      bookingId: booking.id,
      type: "BOOKING_SUBMITTED" as const,
      title: "Pengajuan dari antrean tersedia",
      message: `${entry.user.name} mendapatkan slot antrean ${entry.room.name} (${formatJakarta(entry.startTime)} WIB) dan menunggu persetujuan.`,
    };
    await notifyUser(tx, entry.userId, {
      ...input,
      type: "BOOKING_WAITLIST_PROMOTED",
      title: "Slot antrean tersedia",
      message: `Slot ${entry.room.name} (${formatJakarta(entry.startTime)} WIB) tersedia. Pengajuan Anda masuk untuk ditinjau.`,
    });
    await Promise.all([notifyAdmins(tx, input), notifyRoomLecturers(tx, roomId, input)]);
  }
  await notifyChangedQueuePositions(tx, roomId, previousPositions, waiting[0]?.room.name ?? "ruangan");
}
