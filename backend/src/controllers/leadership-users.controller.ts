import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { HttpError, parse } from "../lib/http";
import { hashPassword } from "../lib/auth";
import { createLeadershipAccountSchema } from "../validators/leadership";

export async function listLeadershipAccounts(_req: AuthRequest, res: Response) {
  const data = await prisma.user.findMany({
    where: { role: "PIMPINAN" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, isActive: true, createdAt: true },
  });
  return res.status(200).json({ success: true, message: "Daftar akun PIMPINAN berhasil diambil", data });
}

export async function createLeadershipAccount(req: AuthRequest, res: Response) {
  const input = parse<{ name: string; email: string; password: string }>(createLeadershipAccountSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new HttpError(409, "Email sudah digunakan akun lain");
  }
  const account = await prisma.user.create({
    data: { ...input, password: await hashPassword(input.password), role: "PIMPINAN" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  return res.status(201).json({ success: true, message: "Akun PIMPINAN berhasil dibuat", data: account });
}
