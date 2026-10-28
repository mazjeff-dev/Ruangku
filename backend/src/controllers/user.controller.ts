
import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";

export async function getProfile(
  req: AuthRequest,
  res: Response
) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user!.userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        nim: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Pengguna tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profil berhasil diambil",
      data: user,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}
