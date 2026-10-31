import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { parseJakartaDate, DAY_MS } from "../lib/time";
import { createRoomSchema, updateRoomSchema } from "../validators/room";
import { hasImageSignature, publicRoomImageUrl, removeRoomImage } from "../lib/upload";
import fs from "node:fs";

const publicSelect = {
  id: true,
  name: true,
  code: true,
  location: true,
  capacity: true,
  description: true,
  facilities: true,
  imageUrl: true,
  isAvailable: true,
} as const;

/** GET /rooms — publik: hanya ruangan aktif & tersedia. Query opsional: q, minCapacity. */
export async function getRooms(
  req: Request,
  res: Response
) {
  const where: Prisma.RoomWhereInput = { isActive: true, isAvailable: true };

  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const term = req.query.q.trim();
    where.OR = [{ name: { contains: term } }, { code: { contains: term } }, { location: { contains: term } }];
  }
  const minCapacity = Number(req.query.minCapacity);
  if (Number.isInteger(minCapacity) && minCapacity > 0) where.capacity = { gte: minCapacity };

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: "asc" },
    select: publicSelect,
  });

  return res.status(200).json({
    success: true,
    message: "Daftar ruangan berhasil diambil",
    total: rooms.length,
    data: rooms,
  });
}

/** GET /rooms/:id/schedule?from=&to= — jadwal terpakai ruangan (tanpa data pribadi), untuk pengguna login. */
export async function getRoomSchedule(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID ruangan");
  const room = await prisma.room.findFirst({ where: { id, isActive: true }, select: publicSelect });
  if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");

  const from = parseJakartaDate(String(req.query.from ?? ""));
  const to = parseJakartaDate(String(req.query.to ?? ""));
  if (!from || !to) throw new HttpError(400, "Parameter 'from' dan 'to' wajib berformat YYYY-MM-DD");
  const toExclusive = new Date(to.getTime() + DAY_MS);
  if (toExclusive <= from || (toExclusive.getTime() - from.getTime()) / DAY_MS > 93) {
    throw new HttpError(400, "Rentang tanggal tidak valid (maksimal 93 hari)");
  }

  const slots = await prisma.booking.findMany({
    where: {
      roomId: id,
      status: { in: ["PENDING", "APPROVED"] },
      startTime: { lt: toExclusive },
      endTime: { gt: from },
    },
    orderBy: { startTime: "asc" },
    select: { id: true, startTime: true, endTime: true, status: true },
  });

  return res.status(200).json({
    success: true,
    message: "Jadwal ruangan berhasil diambil",
    data: { room, bookings: slots },
  });
}

// ---------------------------------------------------------------- Admin

const adminSelect = {
  ...publicSelect,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function countUpcoming(roomId: number) {
  return prisma.booking.count({
    where: { roomId, status: { in: ["PENDING", "APPROVED"] }, endTime: { gt: new Date() } },
  });
}

/** GET /admin/rooms — semua ruangan (termasuk nonaktif) + jumlah peminjaman & status "sedang dipakai". */
export async function adminListRooms(req: AuthRequest, res: Response) {
  const where: Prisma.RoomWhereInput = {};
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const term = req.query.q.trim();
    where.OR = [{ name: { contains: term } }, { code: { contains: term } }, { location: { contains: term } }];
  }
  if (req.query.isActive === "true" || req.query.isActive === "false") where.isActive = req.query.isActive === "true";

  const now = new Date();
  const [rooms, inUse] = await Promise.all([
    prisma.room.findMany({
      where,
      orderBy: { name: "asc" },
      select: { ...adminSelect, _count: { select: { bookings: true } } },
    }),
    prisma.booking.findMany({
      where: { status: "APPROVED", startTime: { lte: now }, endTime: { gt: now } },
      select: { roomId: true },
    }),
  ]);
  const inUseIds = new Set(inUse.map((b) => b.roomId));

  return res.status(200).json({
    success: true,
    message: "Daftar ruangan berhasil diambil",
    total: rooms.length,
    data: rooms.map(({ _count, ...room }) => ({
      ...room,
      totalBookings: _count.bookings,
      inUseNow: inUseIds.has(room.id),
    })),
  });
}

export async function adminGetRoom(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID ruangan");
  const room = await prisma.room.findUnique({ where: { id }, select: adminSelect });
  if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");
  return res.status(200).json({ success: true, message: "Detail ruangan berhasil diambil", data: room });
}

export async function adminCreateRoom(req: AuthRequest, res: Response) {
  const data = parse<any>(createRoomSchema, req.body);

  const exists = await prisma.room.findUnique({ where: { code: data.code }, select: { id: true } });
  if (exists) throw new HttpError(409, `Kode ruangan "${data.code}" sudah digunakan`, { code: "Kode sudah digunakan" });

  const room = await prisma.room.create({ data, select: adminSelect });
  return res.status(201).json({ success: true, message: "Ruangan berhasil ditambahkan", data: room });
}

export async function adminUpdateRoom(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID ruangan");
  const data = parse<any>(updateRoomSchema, req.body);

  const current = await prisma.room.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, "Ruangan tidak ditemukan");

  if (data.code && data.code !== current.code) {
    const exists = await prisma.room.findUnique({ where: { code: data.code }, select: { id: true } });
    if (exists) throw new HttpError(409, `Kode ruangan "${data.code}" sudah digunakan`, { code: "Kode sudah digunakan" });
  }

  // Ruangan tidak boleh dinonaktifkan / ditandai tidak tersedia bila masih punya jadwal mendatang.
  const closing =
    (data.isActive === false && current.isActive) || (data.isAvailable === false && current.isAvailable);
  if (closing) {
    const upcoming = await countUpcoming(id);
    if (upcoming > 0) {
      throw new HttpError(
        409,
        `Ruangan masih memiliki ${upcoming} peminjaman mendatang (menunggu/disetujui). Batalkan atau selesaikan dulu sebelum menonaktifkan.`
      );
    }
  }

  const room = await prisma.room.update({ where: { id }, data, select: adminSelect });
  return res.status(200).json({ success: true, message: "Ruangan berhasil diperbarui", data: room });
}

export async function adminDeleteRoom(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID ruangan");
  const room = await prisma.room.findUnique({ where: { id }, select: { id: true, imageUrl: true } });
  if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");

  const bookings = await prisma.booking.count({ where: { roomId: id } });
  if (bookings > 0) {
    throw new HttpError(
      409,
      `Ruangan memiliki ${bookings} riwayat peminjaman sehingga tidak dapat dihapus. Nonaktifkan ruangan sebagai gantinya.`
    );
  }

  await prisma.room.delete({ where: { id } });
  removeRoomImage(room.imageUrl);
  return res.status(200).json({ success: true, message: "Ruangan berhasil dihapus" });
}

export async function adminUploadRoomPhoto(req: AuthRequest, res: Response) {
  const file = req.file;
  const discard = () => file && fs.promises.unlink(file.path).catch(() => undefined);

  try {
    const id = parseId(req.params.id, "ID ruangan");
    if (!file) throw new HttpError(400, "File foto wajib diunggah (field: photo)");
    if (!hasImageSignature(file.path)) throw new HttpError(400, "File bukan gambar JPG, PNG, atau WebP yang valid");

    const room = await prisma.room.findUnique({ where: { id }, select: { id: true, imageUrl: true } });
    if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");

    const updated = await prisma.room.update({
      where: { id },
      data: { imageUrl: publicRoomImageUrl(file.filename) },
      select: adminSelect,
    });
    removeRoomImage(room.imageUrl);

    return res.status(200).json({ success: true, message: "Foto ruangan berhasil diunggah", data: updated });
  } catch (error) {
    await discard();
    throw error;
  }
}

export async function adminDeleteRoomPhoto(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID ruangan");
  const room = await prisma.room.findUnique({ where: { id }, select: { id: true, imageUrl: true } });
  if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");

  const updated = await prisma.room.update({ where: { id }, data: { imageUrl: null }, select: adminSelect });
  removeRoomImage(room.imageUrl);
  return res.status(200).json({ success: true, message: "Foto ruangan dihapus", data: updated });
}
