import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { Prisma } from "@prisma/client";

/** Error yang aman ditampilkan ke klien (pesan + status HTTP). */
export class HttpError extends Error {
  status: number;
  errors?: Record<string, string>;

  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.errors = errors;
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg: string) => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
export const forbidden = (msg: string) => new HttpError(403, msg);

/** Validasi data dengan skema Zod; melempar HttpError 400 berisi pesan per-field. */
export function parse<T>(schema: { safeParse: (d: unknown) => any }, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data as T;

  const errors: Record<string, string> = {};
  for (const issue of (result.error as ZodError).issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  const first = Object.values(errors)[0] ?? "Data tidak valid";
  throw new HttpError(400, first, errors);
}

export function parseId(value: unknown, label = "ID"): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw badRequest(`${label} tidak valid`);
  return id;
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan" });
}

/** Penangan error terpusat: format respons selalu { success:false, message }. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    });
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Ukuran foto maksimal 3 MB"
        : "Upload file gagal";
    return res.status(400).json({ success: false, message });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ success: false, message: "Data sudah ada (duplikat)" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }
  }

  if ((err as any)?.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Format JSON tidak valid" });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
}
