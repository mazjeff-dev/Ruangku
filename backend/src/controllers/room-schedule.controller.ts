import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { DAY_MS, parseJakartaDate } from "../lib/time";
import { lockRoom, promoteWaitingBookings } from "../lib/booking";
import { notifyAdmins, notifyRoomLecturers, notifyUser } from "../lib/notify";
import {
  operatingHoursSchema,
  roomClosureSchema,
} from "../validators/room-schedule";

function dateValue(value: string) {
  const parsed = parseJakartaDate(value);
  if (!parsed) throw new HttpError(400, "Tanggal harus berformat YYYY-MM-DD dan valid");
  return new Date(`${value}T00:00:00.000Z`);
}

function closureWhere(roomId: number | null | undefined, startDate: Date, endDate: Date) {
  return {
    startDate: { lte: endDate },
    endDate: { gte: startDate },
    ...(roomId === undefined ? {} : { OR: [{ roomId }, { roomId: null }] }),
  };
}

export async function getRoomOperatingHours(req: AuthRequest, res: Response) {
  const roomId = parseId(req.params.id, "ID ruangan");
  const [room, hours] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId }, select: { id: true } }),
    prisma.roomOperatingHour.findMany({ where: { roomId }, orderBy: { dayOfWeek: "asc" } }),
  ]);
  if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");
  return res.status(200).json({ success: true, data: hours });
}

export async function replaceRoomOperatingHours(req: AuthRequest, res: Response) {
  const roomId = parseId(req.params.id, "ID ruangan");
  const { hours } = parse<{ hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }> }>(
    operatingHoursSchema,
    req.body
  );
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");
  const data = await prisma.$transaction(async (tx) => {
    await tx.roomOperatingHour.deleteMany({ where: { roomId } });
    await tx.roomOperatingHour.createMany({ data: hours.map((hour) => ({ ...hour, roomId })) });
    return tx.roomOperatingHour.findMany({ where: { roomId }, orderBy: { dayOfWeek: "asc" } });
  });
  return res.status(200).json({ success: true, message: "Jam operasional ruangan diperbarui", data });
}

export async function resetRoomOperatingHours(req: AuthRequest, res: Response) {
  const roomId = parseId(req.params.id, "ID ruangan");
  await prisma.roomOperatingHour.deleteMany({ where: { roomId } });
  return res.status(200).json({ success: true, message: "Jam ruangan kembali mengikuti pengaturan global" });
}

export async function listRoomClosures(req: AuthRequest, res: Response) {
  const from = typeof req.query.from === "string" ? dateValue(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? dateValue(req.query.to) : undefined;
  const roomId = typeof req.query.roomId === "string" ? parseId(req.query.roomId, "ID ruangan") : undefined;
  const data = await prisma.roomClosure.findMany({
    where: {
      ...(roomId === undefined ? {} : { OR: [{ roomId }, { roomId: null }] }),
      ...(from || to ? {
        startDate: to ? { lte: to } : undefined,
        endDate: from ? { gte: from } : undefined,
      } : {}),
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    include: { room: { select: { id: true, name: true, code: true } }, creator: { select: { id: true, name: true } } },
  });
  return res.status(200).json({ success: true, total: data.length, data });
}

async function saveClosure(
  req: AuthRequest,
  input: { roomId?: number | null; startDate: string; endDate: string; reason: string; confirmAffected: boolean },
  closureId?: number
) {
  const startDate = dateValue(input.startDate);
  const endDate = dateValue(input.endDate);
  const dayStart = parseJakartaDate(input.startDate)!;
  const dayAfterEnd = new Date(parseJakartaDate(input.endDate)!.getTime() + DAY_MS);
  const data = await prisma.$transaction(async (tx) => {
    const roomIds = input.roomId == null
      ? (await tx.room.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((room) => room.id)
      : [input.roomId];
    for (const roomId of roomIds) await lockRoom(tx, roomId);
    const impacted = await tx.booking.findMany({
      where: {
        ...(input.roomId == null ? {} : { roomId: input.roomId }),
        status: { in: ["PENDING", "APPROVED"] },
        startTime: { lt: dayAfterEnd },
        endTime: { gt: dayStart },
      },
      select: {
        id: true, roomId: true, userId: true, title: true, startTime: true,
        room: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    });
    if (impacted.length && !input.confirmAffected) {
      throw new HttpError(409, "Penutupan berdampak pada peminjaman aktif. Konfirmasi pembatalan untuk melanjutkan.", undefined, {
        affectedBookings: impacted,
        confirmationRequired: true,
      });
    }

    const closure = closureId
      ? await tx.roomClosure.update({
        where: { id: closureId },
        data: { roomId: input.roomId ?? null, startDate, endDate, reason: input.reason },
      })
      : await tx.roomClosure.create({
        data: { roomId: input.roomId ?? null, startDate, endDate, reason: input.reason, createdBy: req.user!.userId },
      });

    const affectedRoomIds = new Set<number>();
    for (const booking of impacted) {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          adminNote: `Ruangan ditutup: ${input.reason}`,
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          logs: {
            create: {
              userId: req.user!.userId,
              action: "CANCELLED",
              note: `Ruangan ditutup: ${input.reason}`,
            },
          },
        },
      });
      const message = `"${booking.title}" di ${booking.room.name} dibatalkan karena ruangan ditutup: ${input.reason}`;
      await notifyUser(tx, booking.userId, {
        bookingId: booking.id,
        type: "BOOKING_CANCELLED",
        title: "Peminjaman dibatalkan karena penutupan",
        message,
      });
      const notification = {
        bookingId: booking.id,
        type: "BOOKING_CANCELLED" as const,
        title: "Peminjaman dibatalkan karena penutupan",
        message,
      };
      await Promise.all([notifyAdmins(tx, notification), notifyRoomLecturers(tx, booking.roomId, notification)]);
      affectedRoomIds.add(booking.roomId);
    }
    for (const roomId of affectedRoomIds) await promoteWaitingBookings(tx, roomId);
    return { closure, cancelledBookingIds: impacted.map((booking) => booking.id) };
  });
  return data;
}

export async function createRoomClosure(req: AuthRequest, res: Response) {
  const input = parse<{
    roomId?: number | null; startDate: string; endDate: string; reason: string; confirmAffected: boolean;
  }>(roomClosureSchema, req.body);
  if (input.roomId) {
    const room = await prisma.room.findUnique({ where: { id: input.roomId }, select: { id: true } });
    if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");
  }
  const result = await saveClosure(req, input);
  return res.status(201).json({
    success: true,
    message: result.cancelledBookingIds.length ? "Penutupan dibuat dan peminjaman terdampak dibatalkan" : "Penutupan berhasil dibuat",
    data: result,
  });
}

export async function updateRoomClosure(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID penutupan");
  const input = parse<{
    roomId?: number | null; startDate: string; endDate: string; reason: string; confirmAffected: boolean;
  }>(roomClosureSchema, req.body);
  const existing = await prisma.roomClosure.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HttpError(404, "Penutupan tidak ditemukan");
  if (input.roomId) {
    const room = await prisma.room.findUnique({ where: { id: input.roomId }, select: { id: true } });
    if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");
  }
  const result = await saveClosure(req, input, id);
  return res.status(200).json({ success: true, message: "Penutupan berhasil diperbarui", data: result });
}

export async function deleteRoomClosure(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID penutupan");
  await prisma.roomClosure.delete({ where: { id } });
  return res.status(200).json({ success: true, message: "Penutupan berhasil dihapus" });
}
