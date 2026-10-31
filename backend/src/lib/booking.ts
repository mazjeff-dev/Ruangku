import type { BookingStatus, Prisma } from "@prisma/client";

/**
 * Kunci baris ruangan selama transaksi berjalan, supaya dua permintaan
 * bersamaan untuk ruangan yang sama diproses bergantian (mencegah race condition
 * pada pengecekan jadwal bentrok).
 */
export async function lockRoom(tx: Prisma.TransactionClient, roomId: number) {
  await tx.$queryRaw`SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE`;
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
    where: {
      roomId: params.roomId,
      status: { in: params.statuses },
      startTime: { lt: params.end },
      endTime: { gt: params.start },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    select: { id: true, title: true, startTime: true, endTime: true, status: true },
  });
}
