import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kode verifikasi bukti booking: "RK-<id>-<8 hex>", ditandatangani HMAC dengan JWT_SECRET.
 * Tidak bisa dipalsukan tanpa rahasia server; admin dapat memeriksanya lewat endpoint verifikasi.
 */
function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET tidak tersedia untuk kode verifikasi");
  return s;
}

function signature(bookingId: number, startTime: Date): string {
  return createHmac("sha256", secret()).update(`booking:${bookingId}:${startTime.toISOString()}`).digest("hex").slice(0, 8).toUpperCase();
}

export function makeVerificationCode(bookingId: number, startTime: Date): string {
  return `RK-${bookingId}-${signature(bookingId, startTime)}`;
}

export function parseVerificationCode(code: string): { bookingId: number; sig: string } | null {
  const m = /^RK-(\d{1,9})-([0-9A-F]{8})$/.exec(code.trim().toUpperCase());
  return m ? { bookingId: Number(m[1]), sig: m[2] } : null;
}

export function isValidVerificationCode(bookingId: number, startTime: Date, sig: string): boolean {
  const expected = Buffer.from(signature(bookingId, startTime));
  const given = Buffer.from(sig.toUpperCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}
