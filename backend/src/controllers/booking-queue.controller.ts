import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { findConflict, lockRoom } from "../lib/booking";
import { getEffectiveBookingRules } from "../lib/rules";
import { createBookingSchema } from "../validators/booking";
import { assertRoomSchedule } from "../lib/operating-hours";
import { assertAttendeeCapacity } from "../lib/booking-policy";
import { assertBookingNotBlocked, assertQueueQuota, getUserBookingQuota, lockUserQuota } from "../lib/booking-quota";
import { getQueuePositionsByRoom, notifyChangedQueuePositions } from "../lib/booking-queue-position";

const queueSelect = {
  id: true,
  title: true,
  purpose: true,
  startTime: true,
  endTime: true,
  attendees: true,
  status: true,
  createdAt: true,
  room: { select: { id: true, name: true, code: true, location: true } },
  promotedBookingId: true,
} as const;

export async function joinBookingQueue(req: AuthRequest, res: Response) {
  const rules = await getEffectiveBookingRules();
  const input = parse<{
    roomId: number;
    title: string;
    purpose: string;
    attendees: number;
    startTime: Date;
    endTime: Date;
  }>(createBookingSchema(rules), req.body);
  if (input.startTime <= new Date()) throw new HttpError(400, "Waktu mulai harus di masa depan");

  const result = await prisma.$transaction(async (tx) => {
    await lockRoom(tx, input.roomId);
    await lockUserQuota(tx, req.user!.userId);
    const room = await tx.room.findUnique({ where: { id: input.roomId } });
    if (!room || !room.isActive || !room.isAvailable) throw new HttpError(404, "Ruangan tidak ditemukan atau tidak tersedia");
    assertAttendeeCapacity(input.attendees, room.capacity);
    await assertRoomSchedule(tx, room.id, input.startTime, input.endTime);
    await assertBookingNotBlocked(tx, req.user!.userId);
    assertQueueQuota(await getUserBookingQuota(tx, req.user!.userId, rules));

    const conflict = await findConflict(tx, {
      roomId: room.id,
      start: input.startTime,
      end: input.endTime,
      statuses: ["PENDING", "APPROVED"],
    });
    if (!conflict) throw new HttpError(409, "Slot masih tersedia. Silakan ajukan peminjaman langsung.");

    const duplicate = await tx.bookingQueue.findFirst({
      where: {
        userId: req.user!.userId,
        roomId: room.id,
        status: "WAITING",
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime },
      },
      select: { id: true },
    });
    if (duplicate) throw new HttpError(409, "Anda sudah berada dalam antrean untuk jadwal yang bertabrakan");

    const entry = await tx.bookingQueue.create({
      data: {
        userId: req.user!.userId,
        roomId: room.id,
        title: input.title,
        purpose: input.purpose,
        startTime: input.startTime,
        endTime: input.endTime,
        attendees: input.attendees,
      },
      select: queueSelect,
    });
    const ahead = await tx.bookingQueue.count({
      where: {
        roomId: room.id,
        status: "WAITING",
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime },
        OR: [
          { createdAt: { lt: entry.createdAt } },
          { createdAt: entry.createdAt, id: { lt: entry.id } },
        ],
      },
    });
    return { ...entry, position: ahead + 1 };
  });

  return res.status(201).json({
    success: true,
    message: "Anda berhasil masuk antrean ruangan",
    data: result,
  });
}

export async function listMyBookingQueue(req: AuthRequest, res: Response) {
  const entries = await prisma.bookingQueue.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: queueSelect,
  });
  const positions = await getQueuePositionsByRoom(prisma, [...new Set(entries.map((entry) => entry.room.id))]);
  const positionById = new Map([...positions.values()].flat().map((entry) => [entry.id, entry.position]));
  const data = entries.map((entry) => ({ ...entry, position: positionById.get(entry.id) ?? null }));
  return res.status(200).json({ success: true, message: "Antrean peminjaman berhasil diambil", data });
}

export async function cancelBookingQueueEntry(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID antrean");
  await prisma.$transaction(async (tx) => {
    const entry = await tx.bookingQueue.findUnique({ where: { id } });
    if (!entry || entry.userId !== req.user!.userId) throw new HttpError(404, "Antrean tidak ditemukan");
    await lockRoom(tx, entry.roomId);
    const current = await tx.bookingQueue.findUniqueOrThrow({ where: { id } });
    if (current.status !== "WAITING") throw new HttpError(400, "Hanya antrean yang masih menunggu yang dapat dibatalkan");
    const previousPositions = await getQueuePositionsByRoom(tx, [entry.roomId]);
    await tx.bookingQueue.update({ where: { id }, data: { status: "CANCELLED" } });
    const room = await tx.room.findUniqueOrThrow({ where: { id: entry.roomId }, select: { name: true } });
    await notifyChangedQueuePositions(tx, entry.roomId, previousPositions.get(entry.roomId) ?? [], room.name);
  });
  return res.status(200).json({ success: true, message: "Antrean berhasil dibatalkan" });
}
