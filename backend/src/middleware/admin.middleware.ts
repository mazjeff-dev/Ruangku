
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.middleware";

export function authorizeAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Autentikasi diperlukan",
    });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Akses ditolak, khusus admin",
    });
  }

  next();
}
