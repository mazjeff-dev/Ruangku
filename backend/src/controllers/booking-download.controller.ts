import type { Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError, parseId } from "../lib/http";
import { toCsv, wibText } from "../lib/csv";
import { buildSimplePdf, type PdfItem } from "../lib/pdf";
import { buildIcs } from "../lib/ics";
import { isValidVerificationCode, makeVerificationCode, parseVerificationCode } from "../lib/booking-verification";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  COMPLETED: "Selesai",
  NO_SHOW: "Tidak hadir",
};

const downloadSelect = {
  id: true,
  userId: true,
  title: true,
  purpose: true,
  status: true,
  attendees: true,
  startTime: true,
  endTime: true,
  checkedInAt: true,
  checkedOutAt: true,
  overstayMinutes: true,
  createdAt: true,
  room: { select: { name: true, code: true, location: true } },
  student: { select: { name: true, nim: true, email: true } },
} as const;

/** Pemilik booking atau ADMIN. 404 (bukan 403) untuk milik orang lain agar keberadaan data tidak bocor. */
async function loadAuthorizedBooking(req: AuthRequest) {
  const id = parseId(req.params.id, "ID pengajuan");
  const booking = await prisma.booking.findUnique({ where: { id }, select: downloadSelect });
  const isOwner = booking?.userId === req.user!.userId;
  if (!booking || (!isOwner && req.user!.role !== "ADMIN")) {
    throw new HttpError(404, "Pengajuan peminjaman tidak ditemukan");
  }
  return booking;
}

function requireDownloadable(status: string) {
  if (status !== "APPROVED" && status !== "COMPLETED") {
    throw new HttpError(409, "Berkas hanya tersedia untuk peminjaman yang disetujui atau sudah selesai");
  }
}

/** GET /bookings/:id/receipt — bukti booking (PDF) dengan kode verifikasi. */
export async function getBookingReceiptPdf(req: AuthRequest, res: Response) {
  const b = await loadAuthorizedBooking(req);
  requireDownloadable(b.status);
  const code = makeVerificationCode(b.id, b.startTime);

  const items: PdfItem[] = [
    { text: "RuangKu", size: 22, bold: true },
    { text: "Bukti Peminjaman Ruangan", size: 13 },
    { rule: true, gapBefore: 10 },
    { text: "Kode verifikasi", size: 9, gapBefore: 6 },
    { text: code, size: 18, bold: true },
    { text: `Status: ${STATUS_LABEL[b.status] ?? b.status}`, size: 11, gapBefore: 6 },
    { rule: true, gapBefore: 8 },
    { text: "Kegiatan", size: 9, gapBefore: 6 },
    { text: b.title, size: 12, bold: true },
    { text: "Ruangan", size: 9, gapBefore: 6 },
    { text: `${b.room.name} (${b.room.code})`, size: 12 },
    { text: b.room.location, size: 10 },
    { text: "Waktu (WIB)", size: 9, gapBefore: 6 },
    { text: `${wibText(b.startTime)} s.d. ${wibText(b.endTime).slice(11)}`, size: 12 },
    { text: "Peminjam", size: 9, gapBefore: 6 },
    { text: `${b.student.name}${b.student.nim ? ` (${b.student.nim})` : ""}`, size: 12 },
    { text: "Jumlah peserta", size: 9, gapBefore: 6 },
    { text: b.attendees != null ? String(b.attendees) : "-", size: 12 },
    { text: "Tujuan", size: 9, gapBefore: 6 },
    { text: b.purpose, size: 11 },
    ...(b.checkedInAt ? [{ text: "Check-in (WIB)", size: 9, gapBefore: 6 }, { text: wibText(b.checkedInAt), size: 11 }] as PdfItem[] : []),
    ...(b.checkedOutAt ? [{ text: "Check-out (WIB)", size: 9, gapBefore: 6 }, { text: wibText(b.checkedOutAt), size: 11 }] as PdfItem[] : []),
    { rule: true, gapBefore: 12 },
    { text: `Dicetak ${wibText(new Date())} WIB. Keaslian dokumen dapat diperiksa oleh admin dengan kode verifikasi di atas.`, size: 8, gapBefore: 4 },
  ];

  const pdf = buildSimplePdf(items, { title: `Bukti Booking ${code}` });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="bukti-booking-${b.id}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).send(pdf);
}

/** GET /bookings/:id/calendar.ics — jadwal untuk aplikasi kalender. */
export async function getBookingCalendarIcs(req: AuthRequest, res: Response) {
  const b = await loadAuthorizedBooking(req);
  requireDownloadable(b.status);
  const ics = buildIcs({
    uid: `booking-${b.id}@ruangku`,
    title: `${b.title} - ${b.room.name}`,
    description: `Peminjaman ruangan ${b.room.name} (${b.room.code}). Kode verifikasi: ${makeVerificationCode(b.id, b.startTime)}`,
    location: `${b.room.name}, ${b.room.location}`,
    start: b.startTime,
    end: b.endTime,
  });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="booking-${b.id}.ics"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).send(ics);
}

/** GET /bookings/my/export — riwayat peminjaman milik sendiri (CSV). */
export async function exportMyBookingsCsv(req: AuthRequest, res: Response) {
  const rows = await prisma.booking.findMany({
    where: { userId: req.user!.userId },
    orderBy: { startTime: "desc" },
    take: 5000,
    select: {
      id: true, title: true, status: true, startTime: true, endTime: true, attendees: true,
      checkedInAt: true, checkedOutAt: true, overstayMinutes: true, adminNote: true, createdAt: true,
      room: { select: { name: true, code: true } },
    },
  });
  const header = ["ID", "Kegiatan", "Ruangan", "Kode", "Mulai (WIB)", "Selesai (WIB)", "Peserta", "Status", "Check-in (WIB)", "Check-out (WIB)", "Overstay (menit)", "Catatan admin", "Diajukan (WIB)"];
  const body = rows.map((r) => [
    r.id, r.title, r.room.name, r.room.code, wibText(r.startTime), wibText(r.endTime), r.attendees,
    STATUS_LABEL[r.status] ?? r.status, wibText(r.checkedInAt), wibText(r.checkedOutAt), r.overstayMinutes, r.adminNote, wibText(r.createdAt),
  ]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="riwayat-peminjaman.csv"');
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).send(toCsv(header, body));
}

/** GET /admin/bookings/verify?code=RK-12-ABCD1234 — admin memeriksa keaslian bukti. */
export async function verifyBookingReceipt(req: AuthRequest, res: Response) {
  const raw = typeof req.query.code === "string" ? req.query.code : "";
  const parsed = parseVerificationCode(raw);
  if (!parsed) throw new HttpError(400, "Format kode verifikasi tidak valid (contoh: RK-12-ABCD1234)");
  const b = await prisma.booking.findUnique({ where: { id: parsed.bookingId }, select: downloadSelect });
  const valid = !!b && isValidVerificationCode(b.id, b.startTime, parsed.sig);
  if (!valid || !b) {
    return res.status(200).json({ success: true, message: "Kode tidak cocok dengan data peminjaman", data: { valid: false } });
  }
  return res.status(200).json({
    success: true,
    message: "Kode verifikasi valid",
    data: {
      valid: true,
      booking: {
        id: b.id, title: b.title, status: b.status, startTime: b.startTime, endTime: b.endTime,
        room: b.room, student: { name: b.student.name, nim: b.student.nim },
      },
    },
  });
}
