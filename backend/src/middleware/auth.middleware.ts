
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
    role: "STUDENT" | "ADMIN";
  };
}

export function authenticateToken(
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
      (payload.role !== "STUDENT" && payload.role !== "ADMIN")
    ) {
      return res.status(401).json({
        success: false,
        message: "Token tidak valid",
      });
    }

    req.user = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau sudah kedaluwarsa",
    });
  }
}
