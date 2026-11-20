import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.middleware";

export function authorizeStudent(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Autentikasi diperlukan" });
  }
  if (req.user.role !== "STUDENT" && req.user.role !== "DOSEN") {
    return res.status(403).json({ success: false, message: "Akses khusus mahasiswa dan dosen" });
  }
  next();
}
