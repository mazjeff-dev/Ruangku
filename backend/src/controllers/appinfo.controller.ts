import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";

/** GET /admin/app-info — informasi aplikasi untuk halaman pengaturan. */
export async function getAppInfo(_req: AuthRequest, res: Response) {
  let database = "terhubung";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "tidak terhubung";
  }

  return res.status(200).json({
    success: true,
    data: {
      name: "RuangKu",
      tagline: "Find Your Space. Make It Happen.",
      version: "1.1.0",
      apiPrefix: "/api/v1",
      timezone: "Asia/Jakarta",
      node: process.version,
      database,
      serverTime: new Date().toISOString(),
    },
  });
}
