import type { Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";

const studentSelect = {
  id: true,
  name: true,
  email: true,
  nim: true,
  isActive: true,
  bookingBlockedUntil: true,
  createdAt: true,
} as const;

/** GET /admin/students?q=&status=active|inactive&page=&pageSize= */
export async function listStudents(req: AuthRequest, res: Response) {
  const where: Prisma.UserWhereInput = { role: "STUDENT" };

  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const term = req.query.q.trim();
    where.OR = [{ name: { contains: term } }, { email: { contains: term } }, { nim: { contains: term } }];
  }
  if (req.query.status === "active") where.isActive = true;
  else if (req.query.status === "inactive") where.isActive = false;

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const [total, students] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { ...studentSelect, _count: { select: { bookings: true } } },
    }),
  ]);

  return res.status(200).json({
    success: true,
    message: "Daftar mahasiswa berhasil diambil",
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    data: students.map(({ _count, ...s }) => ({ ...s, totalBookings: _count.bookings })),
  });
}

/** GET /admin/students/:id — detail akun + ringkasan & riwayat peminjaman. */
export async function getStudent(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID mahasiswa");

  const student = await prisma.user.findFirst({ where: { id, role: "STUDENT" }, select: studentSelect });
  if (!student) throw new HttpError(404, "Mahasiswa tidak ditemukan");

  const [groups, bookings, violations] = await Promise.all([
    prisma.booking.groupBy({ by: ["status"], where: { userId: id }, _count: { _all: true } }),
    prisma.booking.findMany({
      where: { userId: id },
      orderBy: { startTime: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
        attendees: true,
        adminNote: true,
        checkedInAt: true,
        checkedOutAt: true,
        overstayMinutes: true,
        room: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.violationPoint.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { booking: { select: { id: true, title: true, startTime: true, room: { select: { name: true } } } } },
    }),
  ]);

  const stats: Record<string, number> = { total: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, COMPLETED: 0, NO_SHOW: 0 };
  for (const g of groups) {
    stats[g.status] = g._count._all;
    stats.total += g._count._all;
  }

  return res.status(200).json({
    success: true,
    message: "Detail mahasiswa berhasil diambil",
    data: {
      ...student,
      stats,
      bookings,
      violations,
      totalViolationPoints: violations.reduce((sum, point) => sum + (point.waivedAt ? 0 : point.points), 0),
    },
  });
}

const statusSchema = z.object({ isActive: z.boolean({ error: "isActive harus true atau false" }) });

/** PATCH /admin/students/:id/status — aktifkan / nonaktifkan akun mahasiswa. */
export async function setStudentStatus(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID mahasiswa");
  const { isActive } = parse<{ isActive: boolean }>(statusSchema, req.body);

  const student = await prisma.user.findFirst({ where: { id, role: "STUDENT" }, select: { id: true } });
  if (!student) throw new HttpError(404, "Mahasiswa tidak ditemukan");

  const updated = await prisma.user.update({ where: { id }, data: { isActive }, select: studentSelect });

  return res.status(200).json({
    success: true,
    message: isActive ? "Akun mahasiswa diaktifkan" : "Akun mahasiswa dinonaktifkan",
    data: updated,
  });
}
