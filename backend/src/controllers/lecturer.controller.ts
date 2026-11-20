import type { Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { HttpError, parse, parseId } from "../lib/http";
import type { AuthRequest } from "../middleware/auth.middleware";
import { createLecturerSchema, lecturerRoomsSchema, lecturerStatusSchema } from "../validators/lecturer";
import type { BookingStatus } from "@prisma/client";

const bookingStatuses: BookingStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "NO_SHOW"];

export async function listAssignedRooms(req: AuthRequest, res: Response) {
  const rooms = await prisma.roomLecturer.findMany({
    where: { userId: req.user!.userId },
    orderBy: { room: { name: "asc" } },
    select: { assignedAt: true, room: { select: { id: true, name: true, code: true, location: true, capacity: true, isActive: true } } },
  });
  return res.status(200).json({ success: true, message: "Ruangan yang ditugaskan berhasil diambil", total: rooms.length, data: rooms });
}

export async function listAssignedBookings(req: AuthRequest, res: Response) {
  const where: Prisma.BookingWhereInput = {
    room: { lecturers: { some: { userId: req.user!.userId } } },
  };
  if (typeof req.query.status === "string" && req.query.status) {
    if (!bookingStatuses.includes(req.query.status as BookingStatus)) throw new HttpError(400, "Filter status tidak valid");
    where.status = req.query.status as BookingStatus;
    if (req.query.status === "PENDING") where.userId = { not: req.user!.userId };
  }
  if (typeof req.query.roomId === "string" && req.query.roomId) {
    const roomId = Number(req.query.roomId);
    if (!Number.isInteger(roomId) || roomId < 1) throw new HttpError(400, "ID ruangan tidak valid");
    where.roomId = roomId;
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        room: { select: { id: true, name: true, code: true, location: true } },
        student: { select: { id: true, name: true, email: true, nim: true } },
        reviewer: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);
  return res.status(200).json({
    success: true,
    message: "Daftar peminjaman ruangan tugas berhasil diambil",
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    data: bookings,
  });
}

export async function getAssignedBookingDetail(req: AuthRequest, res: Response) {
  const bookingId = parseId(req.params.id, "ID peminjaman");
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      room: { lecturers: { some: { userId: req.user!.userId } } },
    },
    include: {
      room: { select: { id: true, name: true, code: true, location: true, capacity: true, facilities: true, imageUrl: true } },
      student: { select: { id: true, name: true, email: true, nim: true } },
      reviewer: { select: { id: true, name: true, role: true } },
      logs: {
        orderBy: { createdAt: "asc" },
        select: { id: true, action: true, note: true, createdAt: true, user: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!booking) throw new HttpError(404, "Peminjaman tidak ditemukan");
  return res.status(200).json({ success: true, message: "Detail peminjaman berhasil diambil", data: booking });
}

export async function getLecturerDashboard(req: AuthRequest, res: Response) {
  const where: Prisma.BookingWhereInput = { room: { lecturers: { some: { userId: req.user!.userId } } } };
  const [groups, pending, upcoming, roomCount] = await Promise.all([
    prisma.booking.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.booking.findMany({
      where: { ...where, status: "PENDING", userId: { not: req.user!.userId } },
      orderBy: { createdAt: "asc" },
      take: 8,
      include: {
        room: { select: { id: true, name: true, code: true } },
        student: { select: { id: true, name: true, nim: true } },
      },
    }),
    prisma.booking.findMany({
      where: { ...where, status: "APPROVED", startTime: { gt: new Date() } },
      orderBy: { startTime: "asc" },
      take: 6,
      include: {
        room: { select: { id: true, name: true, code: true } },
        student: { select: { id: true, name: true } },
      },
    }),
    prisma.roomLecturer.count({ where: { userId: req.user!.userId } }),
  ]);
  const byStatus: Record<string, number> = Object.fromEntries(bookingStatuses.map((status) => [status, 0]));
  for (const group of groups) byStatus[group.status] = group._count._all;
  return res.status(200).json({
    success: true,
    message: "Dashboard dosen berhasil diambil",
    data: { rooms: roomCount, bookings: byStatus, pending, upcoming },
  });
}

export async function listLecturers(req: AuthRequest, res: Response) {
  const where: Prisma.UserWhereInput = { role: "DOSEN" };
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const term = req.query.q.trim();
    where.OR = [{ name: { contains: term } }, { email: { contains: term } }];
  }
  if (req.query.status === "active") where.isActive = true;
  else if (req.query.status === "inactive") where.isActive = false;

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const [total, lecturers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        lecturerRooms: {
          orderBy: { room: { name: "asc" } },
          select: { assignedAt: true, room: { select: { id: true, name: true, code: true, location: true } } },
        },
        _count: { select: { reviewedBookings: true } },
      },
    }),
  ]);
  return res.status(200).json({
    success: true,
    message: "Daftar dosen berhasil diambil",
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    data: lecturers.map(({ _count, ...lecturer }) => ({ ...lecturer, reviewedBookings: _count.reviewedBookings })),
  });
}

export async function createLecturer(req: AuthRequest, res: Response) {
  const input = parse<{ name: string; email: string; password: string }>(createLecturerSchema, req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new HttpError(409, "Email sudah digunakan akun lain");

  const lecturer = await prisma.user.create({
    data: { ...input, password: await hashPassword(input.password), role: "DOSEN" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  return res.status(201).json({ success: true, message: "Akun dosen berhasil dibuat", data: lecturer });
}

export async function setLecturerStatus(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID dosen");
  const { isActive } = parse<{ isActive: boolean }>(lecturerStatusSchema, req.body);
  const lecturer = await prisma.user.findFirst({ where: { id, role: "DOSEN" }, select: { id: true } });
  if (!lecturer) throw new HttpError(404, "Dosen tidak ditemukan");

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  return res.status(200).json({
    success: true,
    message: isActive ? "Akun dosen diaktifkan" : "Akun dosen dinonaktifkan",
    data: updated,
  });
}

export async function setLecturerRooms(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID dosen");
  const { roomIds } = parse<{ roomIds: number[] }>(lecturerRoomsSchema, req.body);

  const lecturer = await prisma.user.findFirst({ where: { id, role: "DOSEN" }, select: { id: true } });
  if (!lecturer) throw new HttpError(404, "Dosen tidak ditemukan");

  const rooms = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true } });
  if (rooms.length !== roomIds.length) throw new HttpError(400, "Satu atau lebih ruangan tidak ditemukan");

  const assignments = await prisma.$transaction(async (tx) => {
    await tx.roomLecturer.deleteMany({ where: { userId: id } });
    if (roomIds.length) {
      await tx.roomLecturer.createMany({ data: roomIds.map((roomId) => ({ userId: id, roomId })) });
    }
    return tx.roomLecturer.findMany({
      where: { userId: id },
      orderBy: { room: { name: "asc" } },
      select: { room: { select: { id: true, name: true, code: true, location: true } }, assignedAt: true },
    });
  });
  return res.status(200).json({
    success: true,
    message: "Penugasan ruangan dosen berhasil diperbarui",
    data: assignments,
  });
}
