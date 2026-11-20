import type { Response } from "express";
import type { BookingQueueStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parseId } from "../lib/http";
import { DAY_MS, parseJakartaDate } from "../lib/time";
import { parse } from "../lib/http";
import { cancelQueueEntrySchema } from "../validators/booking-queue";
import { lockRoom } from "../lib/booking";
import { notifyUser } from "../lib/notify";
import { getQueuePositionsByRoom, notifyChangedQueuePositions } from "../lib/booking-queue-position";

const QUEUE_STATUSES: BookingQueueStatus[] = ["WAITING", "PROMOTED", "CANCELLED"];

function parseQueueFilters(req: AuthRequest, lecturer = false) {
  const query = req.query;
  const where: Prisma.BookingQueueWhereInput = {};
  if (lecturer) {
    where.room = { lecturers: { some: { userId: req.user!.userId } } };
  }
  if (typeof query.status === "string" && query.status) {
    if (!QUEUE_STATUSES.includes(query.status as BookingQueueStatus)) {
      throw new HttpError(400, "Filter status antrean tidak valid");
    }
    where.status = query.status as BookingQueueStatus;
  }
  if (typeof query.roomId === "string" && query.roomId) {
    where.roomId = parseId(query.roomId, "ID ruangan");
  }
  const range: Prisma.DateTimeFilter = {};
  if (typeof query.from === "string" && query.from) {
    const from = parseJakartaDate(query.from);
    if (!from) throw new HttpError(400, "Format tanggal 'from' harus YYYY-MM-DD");
    range.gte = from;
  }
  if (typeof query.to === "string" && query.to) {
    const to = parseJakartaDate(query.to);
    if (!to) throw new HttpError(400, "Format tanggal 'to' harus YYYY-MM-DD");
    range.lt = new Date(to.getTime() + DAY_MS);
  }
  if (range.gte || range.lt) where.startTime = range;
  if (typeof query.q === "string" && query.q.trim()) {
    const term = query.q.trim();
    where.OR = [
      { title: { contains: term } },
      { user: { name: { contains: term } } },
      { user: { nim: { contains: term } } },
      { room: { name: { contains: term } } },
    ];
  }
  return where;
}

async function listBookingQueue(req: AuthRequest, res: Response, lecturer: boolean) {
  const where = parseQueueFilters(req, lecturer);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const [total, entries] = await Promise.all([
    prisma.bookingQueue.count({ where }),
    prisma.bookingQueue.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        room: { select: { id: true, name: true, code: true, location: true } },
        user: { select: { id: true, name: true, email: true, nim: true } },
        promotedBooking: { select: { id: true, status: true } },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { actor: { select: { id: true, name: true, role: true } } },
        },
      },
    }),
  ]);
  const positions = await getQueuePositionsByRoom(prisma, [...new Set(entries.map((entry) => entry.roomId))]);
  const positionById = new Map([...positions.values()].flat().map((entry) => [entry.id, entry.position]));
  const data = entries.map((entry) => ({
    ...entry,
    position: entry.status === "WAITING" ? positionById.get(entry.id) ?? null : null,
  }));
  return res.status(200).json({
    success: true,
    message: "Daftar antrean peminjaman berhasil diambil",
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    data,
  });
}

export async function listAllBookingQueue(req: AuthRequest, res: Response) {
  return listBookingQueue(req, res, false);
}

export async function listAssignedBookingQueue(req: AuthRequest, res: Response) {
  return listBookingQueue(req, res, true);
}

export async function cancelBookingQueueByStaff(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID antrean");
  const { reason } = parse<{ reason: string }>(cancelQueueEntrySchema, req.body);
  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.bookingQueue.findUnique({ where: { id }, select: { roomId: true } });
    if (!found) throw new HttpError(404, "Antrean tidak ditemukan");
    await lockRoom(tx, found.roomId);
    const entry = await tx.bookingQueue.findUnique({
      where: { id },
      include: { user: { select: { id: true } }, room: { select: { name: true } } },
    });
    if (!entry || entry.status !== "WAITING") throw new HttpError(400, "Hanya antrean yang masih menunggu yang dapat dibatalkan");
    if (req.user!.role === "DOSEN") {
      const assignment = await tx.roomLecturer.findUnique({
        where: { roomId_userId: { roomId: entry.roomId, userId: req.user!.userId } },
        select: { roomId: true },
      });
      if (!assignment) throw new HttpError(403, "Anda tidak ditugaskan pada ruangan ini");
    }

    const previousPositions = await getQueuePositionsByRoom(tx, [entry.roomId]);
    const updated = await tx.bookingQueue.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: { id: true, status: true },
    });
    await tx.bookingQueueLog.create({
      data: { queueId: id, actorId: req.user!.userId, action: "CANCELLED_BY_STAFF", reason },
    });
    await notifyUser(tx, entry.userId, {
      type: "BOOKING_CANCELLED",
      title: "Antrean dibatalkan oleh pengelola",
      message: `Antrean "${entry.title}" di ${entry.room.name} dibatalkan. Alasan: ${reason}`,
    });
    await notifyChangedQueuePositions(tx, entry.roomId, previousPositions.get(entry.roomId) ?? [], entry.room.name);
    return updated;
  });
  return res.status(200).json({ success: true, message: "Antrean berhasil dibatalkan", data: result });
}
