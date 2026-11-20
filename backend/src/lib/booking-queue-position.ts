import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { notifyUser } from "./notify";

type QueueDb = Prisma.TransactionClient | typeof prisma;

type QueuePosition = {
  id: number;
  userId: number;
  position: number;
};

export async function getQueuePositions(db: QueueDb, roomId: number): Promise<QueuePosition[]> {
  const byRoom = await getQueuePositionsByRoom(db, [roomId]);
  return byRoom.get(roomId) ?? [];
}

export async function getQueuePositionsByRoom(db: QueueDb, roomIds: number[]) {
  if (roomIds.length === 0) return new Map<number, QueuePosition[]>();
  const entries = await db.bookingQueue.findMany({
    where: { roomId: { in: roomIds }, status: "WAITING", startTime: { gt: new Date() } },
    orderBy: [{ roomId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, userId: true, roomId: true, startTime: true, endTime: true, createdAt: true },
  });
  const result = new Map<number, QueuePosition[]>();
  const grouped = new Map<number, typeof entries>();
  for (const entry of entries) grouped.set(entry.roomId, [...(grouped.get(entry.roomId) ?? []), entry]);
  for (const [roomId, roomEntries] of grouped) {
    result.set(roomId, roomEntries.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        position: roomEntries.filter((other) =>
          other.startTime < entry.endTime &&
          other.endTime > entry.startTime &&
          (other.createdAt < entry.createdAt ||
            (other.createdAt.getTime() === entry.createdAt.getTime() && other.id <= entry.id))
        ).length,
      })));
  }
  return result;
}

export async function notifyChangedQueuePositions(
  db: QueueDb,
  roomId: number,
  previous: QueuePosition[],
  roomName: string
) {
  const current = await getQueuePositions(db, roomId);
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  for (const entry of current) {
    const before = previousById.get(entry.id);
    if (!before || before.position === entry.position) continue;
    await notifyUser(db, entry.userId, {
      type: "QUEUE_POSITION_CHANGED",
      title: "Posisi antrean berubah",
      message: `Posisi antrean Anda untuk ${roomName} berubah dari #${before.position} menjadi #${entry.position}.`,
    });
  }
}

export async function notifyQueueExpired(
  db: QueueDb,
  entry: { id: number; userId: number; title: string; roomName: string }
) {
  await notifyUser(db, entry.userId, {
    type: "QUEUE_EXPIRED",
    title: "Antrean kedaluwarsa",
    message: `Antrean "${entry.title}" untuk ${entry.roomName} berakhir karena waktu mulai telah lewat.`,
  });
}
