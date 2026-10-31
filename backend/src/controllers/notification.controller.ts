import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parseId } from "../lib/http";

/** GET /notifications?unread=true&page=&pageSize= — notifikasi milik pengguna yang login. */
export async function listNotifications(req: AuthRequest, res: Response) {
  const userId = req.user!.userId;
  const where = { userId, ...(req.query.unread === "true" ? { isRead: false } : {}) };
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const [total, unread, data] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.status(200).json({
    success: true,
    message: "Notifikasi berhasil diambil",
    total,
    unread,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    data,
  });
}

export async function unreadCount(req: AuthRequest, res: Response) {
  const count = await prisma.notification.count({ where: { userId: req.user!.userId, isRead: false } });
  return res.status(200).json({ success: true, data: { count } });
}

export async function markRead(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID notifikasi");
  const result = await prisma.notification.updateMany({
    where: { id, userId: req.user!.userId },
    data: { isRead: true },
  });
  if (result.count === 0) throw new HttpError(404, "Notifikasi tidak ditemukan");
  return res.status(200).json({ success: true, message: "Notifikasi ditandai sudah dibaca" });
}

export async function markAllRead(req: AuthRequest, res: Response) {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data: { isRead: true },
  });
  return res.status(200).json({
    success: true,
    message: "Semua notifikasi ditandai sudah dibaca",
    data: { updated: result.count },
  });
}
