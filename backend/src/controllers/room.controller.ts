
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function getRooms(
  req: Request,
  res: Response
) {
  try {
    const rooms = await prisma.room.findMany({
      where: {
        isAvailable: true,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        capacity: true,
        description: true,
        facilities: true,
        isAvailable: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Daftar ruangan berhasil diambil",
      total: rooms.length,
      data: rooms,
    });
  } catch (error) {
    console.error("Get rooms error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}
