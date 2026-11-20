import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parse, parseId } from "../lib/http";
import { parseJakartaDate, jakartaDateKey, DAY_MS } from "../lib/time";
import { createRoomSchema, updateRoomSchema } from "../validators/room";
import { hasImageSignature, publicRoomImageUrl, removeRoomImage } from "../lib/upload";
import fs from "node:fs";
import { getRoomOperatingInfo } from "../lib/operating-hours";

const publicSelect = {
  id: true,
  name: true,
  code: true,
  location: true,
  category: true,
  capacity: true,
  description: true,
  facilities: true,
  imageUrl: true,
  isAvailable: true,
} as const;

function roomFilters(req: Request): Prisma.RoomWhereInput {
  const where: Prisma.RoomWhereInput = { isActive: true, isAvailable: true };
  const and: Prisma.RoomWhereInput[] = [];

  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const term = req.query.q.trim();
    and.push({ OR: [{ name: { contains: term } }, { code: { contains: term } }, { location: { contains: term } }] });
  }
  if (typeof req.query.category === "string" && req.query.category.trim()) where.category = req.query.category.trim();
  const minCapacity = Number(req.query.minCapacity);
  if (Number.isInteger(minCapacity) && minCapacity > 0) where.capacity = { gte: minCapacity };
  // facility=Proyektor,AC  -> ruangan harus memiliki semua fasilitas tersebut
  if (typeof req.query.facility === "string" && req.query.facility.trim()) {
    for (const f of req.query.facility.split(",").map((x) => x.trim()).filter(Boolean)) {
      and.push({ facilities: { contains: f } });
    }
  }
  if (and.length) where.AND = and;
  return where;
}

function selectedWindow(req: Request) {
  const rawStart = req.query.start;
  const rawEnd = req.query.end;
  if (rawStart === undefined && rawEnd === undefined) return null;
  const start = new Date(String(rawStart ?? ""));
  const end = new Date(String(rawEnd ?? ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new HttpError(400, "Parameter 'start' dan 'end' harus berformat ISO 8601");
  }
  if (end <= start) throw new HttpError(400, "Waktu selesai harus setelah waktu mulai");
  return { start, end };
}

function timeJakarta(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

async function withRoomState<T extends { id: number; isAvailable: boolean }>(rooms: T[], userId?: number, selected?: { start: Date; end: Date } | null) {
  if (rooms.length === 0) return [];
  const now = new Date();
  const ids = rooms.map((room) => room.id);
  const [bookings, queueCounts, queueEntries] = await Promise.all([
    prisma.booking.findMany({
      where: {
        roomId: { in: ids },
        status: { in: ["PENDING", "APPROVED"] },
        endTime: { gt: selected?.start ?? now },
        ...(selected ? { startTime: { lt: selected.end } } : {}),
      },
      select: { roomId: true, startTime: true, endTime: true, status: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.bookingQueue.groupBy({
      by: ["roomId"],
      where: { roomId: { in: ids }, status: "WAITING", startTime: { gt: now }, endTime: { gt: now } },
      _count: { _all: true },
    }),
    prisma.bookingQueue.findMany({
      where: { roomId: { in: ids }, status: "WAITING", startTime: { gt: now }, endTime: { gt: now } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, userId: true, roomId: true, startTime: true, endTime: true, createdAt: true },
    }),
  ]);
  const counts = new Map(queueCounts.map((group) => [group.roomId, group._count._all]));
  const myEntries = userId === undefined ? [] : queueEntries.filter((entry) => entry.userId === userId);

  return rooms.map((room) => {
    const roomBookings = bookings.filter((booking) => booking.roomId === room.id);
    const currentBooking = roomBookings.find((booking) =>
      booking.status === "APPROVED" && booking.startTime <= now && booking.endTime > now
    );
    const conflicts = selected
      ? roomBookings.filter((booking) => booking.startTime < selected.end && booking.endTime > selected.start)
      : [];
    const blockingEnd = conflicts.reduce<Date | null>(
      (latest, booking) => !latest || booking.endTime > latest ? booking.endTime : latest,
      null
    );
    const queuePosition = myEntries
      .filter((entry) => entry.roomId === room.id && (!selected || (entry.startTime < selected.end && entry.endTime > selected.start)))
      .map((entry) => ({
        entry,
        position: queueEntries.filter((other) =>
          other.roomId === room.id &&
          other.startTime < entry.endTime &&
          other.endTime > entry.startTime &&
          (other.createdAt < entry.createdAt ||
            (other.createdAt.getTime() === entry.createdAt.getTime() && other.id <= entry.id))
        ).length,
      }))
      .sort((a, b) => a.entry.createdAt.getTime() - b.entry.createdAt.getTime())[0]?.position ?? null;

    const duration = selected ? selected.end.getTime() - selected.start.getTime() : 60 * 60_000;
    let cursor = selected ? new Date(Math.max(selected.end.getTime(), blockingEnd?.getTime() ?? 0)) : now;
    let nextAvailableStart: Date | null = null;
    for (const booking of roomBookings) {
      if (booking.endTime <= cursor) continue;
      if (booking.startTime.getTime() - cursor.getTime() >= duration) {
        nextAvailableStart = cursor;
        break;
      }
      cursor = new Date(Math.max(cursor.getTime(), booking.endTime.getTime()));
    }
    if (!nextAvailableStart) nextAvailableStart = cursor;

    const status = !room.isAvailable
      ? "UNAVAILABLE"
      : selected
        ? conflicts.length ? "OCCUPIED" : "AVAILABLE_AT_SELECTED_TIME"
        : currentBooking ? "IN_USE" : "AVAILABLE_NOW";
    const occupiedUntil = currentBooking?.endTime ?? blockingEnd;
    const message = status === "UNAVAILABLE"
      ? "Ruangan tidak tersedia"
      : status === "IN_USE"
        ? `Terpakai sampai ${timeJakarta(currentBooking!.endTime)} · slot kosong berikutnya ${timeJakarta(nextAvailableStart)}`
        : status === "OCCUPIED"
          ? `Terpakai sampai ${timeJakarta(blockingEnd!)} · slot kosong berikutnya ${timeJakarta(nextAvailableStart)}`
          : status === "AVAILABLE_AT_SELECTED_TIME"
            ? "Tersedia pada waktu yang dipilih"
            : "Tersedia sekarang";
    return {
      ...room,
      inUseNow: Boolean(currentBooking),
      waitlistCount: counts.get(room.id) ?? 0,
      myWaitlistPosition: queuePosition,
      availability: {
        status,
        message,
        occupiedUntil: occupiedUntil?.toISOString() ?? null,
        nextAvailableStart: nextAvailableStart?.toISOString() ?? null,
        selectedStart: selected?.start.toISOString() ?? null,
        selectedEnd: selected?.end.toISOString() ?? null,
      },
    };
  });
}

/**
 * GET /rooms — publik: ruangan aktif & tersedia.
 * Query: q, category, minCapacity, facility (koma), sort=name|capacity|popular, page, pageSize.
 */
export async function getRooms(
  req: AuthRequest,
  res: Response
) {
  const selected = selectedWindow(req);
  const where = roomFilters(req);
  const sort = req.query.sort;
  const orderBy: Prisma.RoomOrderByWithRelationInput =
    sort === "capacity" ? { capacity: "desc" } : sort === "popular" ? { bookings: { _count: "desc" } } : { name: "asc" };

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));

  const [total, rooms] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: publicSelect }),
  ]);

  return res.status(200).json({
    success: true,
    message: "Daftar ruangan berhasil diambil",
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    data: await withRoomState(rooms, req.user?.userId, selected),
  });
}

/** GET /rooms/available?start=ISO&end=ISO — ruangan yang bebas (tanpa bentrok) pada rentang waktu itu. */
export async function getAvailableRooms(req: AuthRequest, res: Response) {
  const start = new Date(String(req.query.start ?? ""));
  const end = new Date(String(req.query.end ?? ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new HttpError(400, "Parameter 'start' dan 'end' wajib berformat ISO 8601");
  }
  if (end <= start) throw new HttpError(400, "Waktu selesai harus setelah waktu mulai");

  const where = roomFilters(req);
  where.bookings = {
    none: { status: { in: ["PENDING", "APPROVED"] }, startTime: { lt: end }, endTime: { gt: start } },
  };

  const rooms = await prisma.room.findMany({ where, orderBy: { name: "asc" }, select: publicSelect });
  const available = [];
  for (const room of rooms) {
    const operating = await getRoomOperatingInfo(prisma, room.id, start);
    const startKey = jakartaDateKey(start);
    const endKey = jakartaDateKey(end);
    const starts = new Date(start.getTime() + 7 * 60 * 60 * 1000);
    const ends = new Date(end.getTime() + 7 * 60 * 60 * 1000);
    const startMinute = starts.getUTCHours() * 60 + starts.getUTCMinutes();
    const endMinute = ends.getUTCHours() * 60 + ends.getUTCMinutes();
    if (startKey !== endKey || operating.isClosed || operating.closures.length) continue;
    if (operating.openTime && operating.closeTime) {
      const open = Number(operating.openTime.slice(0, 2)) * 60 + Number(operating.openTime.slice(3));
      const close = Number(operating.closeTime.slice(0, 2)) * 60 + Number(operating.closeTime.slice(3));
      if (startMinute < open || endMinute > close) continue;
    }
    available.push({ ...room, operatingHours: operating });
  }
  return res.status(200).json({
    success: true,
    message: "Ruangan yang tersedia berhasil diambil",
    total: available.length,
    data: await withRoomState(available, req.user?.userId, { start, end }),
  });
}

/** GET /rooms/categories — daftar kategori ruangan aktif beserta jumlahnya. */
export async function getRoomCategories(_req: Request, res: Response) {
  const groups = await prisma.room.groupBy({
    by: ["category"],
    where: { isActive: true, category: { not: null } },
    _count: { _all: true },
    orderBy: { category: "asc" },
  });
  return res.status(200).json({
    success: true,
    data: groups.map((g) => ({ name: g.category, total: g._count._all })),
  });
}

/** GET /rooms/:id — detail ruangan aktif. */
export async function getRoomById(req: AuthRequest, res: Response) {
  const id = parseId(req.params.id, "ID ruangan");
  const room = await prisma.room.findFirst({ where: { id, isActive: true }, select: publicSelect });
  if (!room) throw new HttpError(404, "Ruangan tidak ditemukan");
  const selected = selectedWindow(req);
  const [withUse] = await withRoomState([room], req.user?.userId, selected);
  const operatingHours = await getRoomOperatingInfo(prisma, id, new Date());
  return res.status(200).json({ success: true, message: "Detail ruangan berhasil diambil", data: { ...withUse, operatingHours } });
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
    select: { id: true, startTime: true, endTime: true, status: true, attendees: true },
  });
  const [operatingHours, closures, globalHours] = await Promise.all([
    prisma.roomOperatingHour.findMany({ where: { roomId: id }, orderBy: { dayOfWeek: "asc" } }),
    prisma.roomClosure.findMany({
      where: {
        startDate: { lte: new Date(`${jakartaDateKey(new Date(toExclusive.getTime() - 1))}T00:00:00.000Z`) },
        endDate: { gte: new Date(`${jakartaDateKey(from)}T00:00:00.000Z`) },
        OR: [{ roomId: id }, { roomId: null }],
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.globalOperatingHours.findUnique({ where: { id: 1 } }),
  ]);

  return res.status(200).json({
    success: true,
    message: "Jadwal ruangan berhasil diambil",
    data: {
      room,
      bookings: slots,
      operatingHours: {
        overrides: operatingHours,
        default: globalHours
          ? { openTime: globalHours.openTime, closeTime: globalHours.closeTime, operatingDays: globalHours.operatingDays.split(",").map(Number) }
          : null,
      },
      closures,
    },
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
  const [bookings, queued] = await Promise.all([
    prisma.booking.count({
      where: { roomId, status: { in: ["PENDING", "APPROVED"] }, endTime: { gt: new Date() } },
    }),
    prisma.bookingQueue.count({ where: { roomId, status: "WAITING" } }),
  ]);
  return bookings + queued;
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
        `Ruangan masih memiliki ${upcoming} peminjaman atau antrean aktif. Batalkan atau selesaikan dulu sebelum menonaktifkan.`
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

  const [bookings, queueEntries] = await Promise.all([
    prisma.booking.count({ where: { roomId: id } }),
    prisma.bookingQueue.count({ where: { roomId: id } }),
  ]);
  if (bookings > 0 || queueEntries > 0) {
    throw new HttpError(
      409,
      `Ruangan memiliki ${bookings} riwayat peminjaman dan ${queueEntries} riwayat antrean sehingga tidak dapat dihapus. Nonaktifkan ruangan sebagai gantinya.`
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
