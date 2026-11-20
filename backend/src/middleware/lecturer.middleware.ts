import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.middleware";

export function authorizeLecturer(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Autentikasi diperlukan" });
  }
  if (req.user.role !== "DOSEN") {
    return res.status(403).json({ success: false, message: "Akses ditolak, khusus dosen" });
  }
  next();
}
