import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { HttpError } from "./http";

export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
export const ROOM_UPLOAD_DIR = path.join(UPLOAD_ROOT, "rooms");
fs.mkdirSync(ROOM_UPLOAD_DIR, { recursive: true });

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const roomPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ROOM_UPLOAD_DIR),
    filename: (_req, file, cb) =>
      cb(null, `room-${crypto.randomBytes(12).toString("hex")}${EXT[file.mimetype] ?? ".bin"}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT[file.mimetype]) {
      return cb(new HttpError(400, "Format foto harus JPG, PNG, atau WebP"));
    }
    cb(null, true);
  },
});

/** Cek "magic bytes" agar file yang hanya berganti ekstensi/mimetype ditolak. */
export function hasImageSignature(filePath: string): boolean {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
    return jpeg || png || webp;
  } finally {
    fs.closeSync(fd);
  }
}

export function publicRoomImageUrl(filename: string) {
  return `/uploads/rooms/${filename}`;
}

/** Hapus file foto lama (hanya yang berada di folder upload ruangan). */
export function removeRoomImage(imageUrl?: string | null) {
  if (!imageUrl?.startsWith("/uploads/rooms/")) return;
  const file = path.join(ROOM_UPLOAD_DIR, path.basename(imageUrl));
  fs.promises.unlink(file).catch(() => undefined);
}
