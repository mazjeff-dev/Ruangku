import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { parse, HttpError } from "../lib/http";
import { comparePassword, hashPassword } from "../lib/auth";
import { updateProfileSchema, changePasswordSchema } from "../validators/auth";

const profileSelect = {
  id: true,
  name: true,
  email: true,
  nim: true,
  role: true,
  createdAt: true,
} as const;

export async function getProfile(
  req: AuthRequest,
  res: Response
) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user!.userId,
      },
      select: profileSelect,
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

/** PATCH /users/profile — ubah nama dan/atau email milik sendiri. */
export async function updateProfile(req: AuthRequest, res: Response) {
  const input = parse<{ name?: string; email?: string }>(updateProfileSchema, req.body);

  if (input.email) {
    const taken = await prisma.user.findFirst({
      where: { email: input.email, id: { not: req.user!.userId } },
      select: { id: true },
    });
    if (taken) throw new HttpError(409, "Email sudah digunakan akun lain");
  }

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: { name: input.name, email: input.email },
    select: profileSelect,
  });

  return res.status(200).json({
    success: true,
    message: "Profil berhasil diperbarui",
    data: user,
  });
}

/** PATCH /users/password — ubah password setelah memverifikasi password saat ini. */
export async function changePassword(req: AuthRequest, res: Response) {
  const { currentPassword, newPassword } = parse<{
    currentPassword: string;
    newPassword: string;
  }>(changePasswordSchema, req.body);

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, password: true },
  });
  if (!user) throw new HttpError(404, "Pengguna tidak ditemukan");

  if (!(await comparePassword(currentPassword, user.password))) {
    throw new HttpError(400, "Password saat ini salah");
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, "Password baru harus berbeda dari password saat ini");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await hashPassword(newPassword) },
  });

  return res.status(200).json({
    success: true,
    message: "Password berhasil diubah",
  });
}
