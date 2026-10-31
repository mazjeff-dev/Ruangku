// Semua tampilan tanggal/jam memakai zona waktu Asia/Jakarta (WIB).
export const TZ = 'Asia/Jakarta';

export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';

const dateFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const fmtDate = (v: string | Date) => dateFmt.format(new Date(v));
export const fmtTime = (v: string | Date) => timeFmt.format(new Date(v)).replace('.', ':');
export const fmtDateTime = (v: string | Date) => `${fmtDate(v)}, ${fmtTime(v)}`;
export const fmtRange = (s: string | Date, e: string | Date) => `${fmtDate(s)} · ${fmtTime(s)}–${fmtTime(e)}`;

export function fmtRelative(v: string | Date) {
  const diff = Date.now() - new Date(v).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return fmtDate(v);
}

/** "YYYY-MM-DD" menurut WIB */
export const dateKey = (d: Date | string = new Date()) => keyFmt.format(new Date(d));
export const todayKey = () => dateKey(new Date());

export function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayStartMs = (key: string) => Date.parse(`${key}T00:00:00+07:00`);

/** Senin sebagai awal minggu */
export function startOfWeek(key: string) {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0=Min
  return addDays(key, -((dow + 6) % 7));
}
export const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
export function monthEnd(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function addMonths(key: string, n: number) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const DAYS_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
export const longDate = (key: string) => {
  const d = new Date(`${key}T00:00:00Z`);
  const names = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return `${names[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
  COMPLETED: 'Selesai'
};
export const statusLabel = (s: string) => STATUS_LABEL[s as BookingStatus] ?? s;
export const statusClass = (s: string) => s.toLowerCase();

export const ACTION_LABEL: Record<string, string> = {
  CREATED: 'Pengajuan dibuat',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan'
};

export function initials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '?'
  );
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms = 350) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
