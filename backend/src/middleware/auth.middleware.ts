import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET belum diatur di file .env");
  }

  return secret;
}

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    role: "STUDENT" | "ADMIN" | "DOSEN" | "PIMPINAN";
  };
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Token autentikasi tidak ditemukan",
    });
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(token, getJwtSecret());

    if (
      typeof payload === "string" ||
      typeof payload.userId !== "number" ||
      (payload.role !== "STUDENT" && payload.role !== "ADMIN" && payload.role !== "DOSEN" && payload.role !== "PIMPINAN")
    ) {
      return res.status(401).json({
        success: false,
        message: "Token tidak valid",
      });
    }

    // Pastikan akun masih ada & aktif, dan gunakan role terbaru dari database
    // (bukan hanya dari isi token) agar penonaktifan akun langsung berlaku.
    const account = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!account) {
      return res.status(401).json({
        success: false,
        message: "Akun tidak ditemukan",
      });
    }

    if (!account.isActive) {
      return res.status(403).json({
        success: false,
        message: "Akun Anda dinonaktifkan. Hubungi administrator.",
      });
    }

    req.user = {
      userId: account.id,
      role: account.role,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau sudah kedaluwarsa",
    });
  }
}

export async function optionalAuthenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.headers.authorization) return next();
  return authenticateToken(req, res, next);
}

export function enforceLeadershipReadOnly(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (req.method === "GET" || !req.headers.authorization?.startsWith("Bearer ")) return next();
  return authenticateToken(req, res, () => {
    if (req.user?.role === "PIMPINAN") {
      return res.status(403).json({ success: false, message: "Akun PIMPINAN hanya memiliki akses baca" });
    }
    return next();
  });
}
