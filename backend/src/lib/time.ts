// Zona waktu aplikasi: Asia/Jakarta (WIB, UTC+7, tanpa DST).
// Database menyimpan waktu dalam UTC; helper ini dipakai untuk batas hari/bulan versi WIB.
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" (tanggal WIB) -> Date UTC pada pukul 00:00 WIB. null bila format salah. */
export function parseJakartaDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d) - JAKARTA_OFFSET_MS);
  if (Number.isNaN(date.getTime())) return null;
  // tolak tanggal tidak nyata (mis. 2026-02-31)
  return jakartaDateKey(date) === value ? date : null;
}

/** Date -> "YYYY-MM-DD" menurut WIB. */
export function jakartaDateKey(date: Date): string {
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

export function jakartaMonthKey(date: Date): string {
  return jakartaDateKey(date).slice(0, 7);
}

export function startOfJakartaDay(date = new Date()): Date {
  return parseJakartaDate(jakartaDateKey(date))!;
}

export function startOfJakartaMonth(date = new Date()): Date {
  return parseJakartaDate(jakartaDateKey(date).slice(0, 8) + "01")!;
}

export function startOfNextJakartaMonth(date = new Date()): Date {
  const start = startOfJakartaMonth(date);
  const shifted = new Date(start.getTime() + JAKARTA_OFFSET_MS);
  const next = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1);
  return new Date(next - JAKARTA_OFFSET_MS);
}

export function formatJakarta(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
