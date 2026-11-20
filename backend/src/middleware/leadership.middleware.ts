import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.middleware";

export function authorizeLeadership(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Autentikasi diperlukan" });
  }
  // PIMPINAN adalah pembaca utama; ADMIN boleh membaca (endpoint ini hanya GET) agar menu "Dasbor Pengadaan" di sidebar admin berfungsi.
  if (req.user.role !== "PIMPINAN" && req.user.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Akses khusus PIMPINAN dan ADMIN" });
  }
  next();
}
