import { z } from "zod";
import { bookingRules, type BookingRules } from "../lib/rules";

const isoDate = (label: string) =>
  z
    .string({ error: `${label} wajib diisi` })
    .refine((v) => !Number.isNaN(new Date(v).getTime()), `${label} tidak valid`)
    .transform((v) => new Date(v));

export const createBookingSchema = (rules: BookingRules = bookingRules) => z
  .object({
    roomId: z.coerce.number({ error: "Ruangan wajib dipilih" }).int("Ruangan tidak valid").min(1, "Ruangan tidak valid"),
    title: z.string({ error: "Judul kegiatan wajib diisi" }).trim().min(3, "Judul minimal 3 karakter").max(150, "Judul maksimal 150 karakter"),
    purpose: z.string({ error: "Alasan peminjaman wajib diisi" }).trim().min(3, "Alasan minimal 3 karakter").max(2000, "Alasan maksimal 2000 karakter"),
    attendees: z.coerce.number({ error: "Jumlah peserta wajib diisi" }).int("Jumlah peserta harus berupa bilangan bulat").min(1, "Jumlah peserta minimal 1"),
    startTime: isoDate("Waktu mulai"),
    endTime: isoDate("Waktu selesai"),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "Waktu selesai harus setelah waktu mulai",
    path: ["endTime"],
  })
  .refine((v) => v.endTime.getTime() - v.startTime.getTime() >= rules.minMinutes * 60_000, {
    message: `Durasi peminjaman minimal ${rules.minMinutes} menit`,
    path: ["endTime"],
  })
  .refine((v) => v.endTime.getTime() - v.startTime.getTime() <= rules.maxHours * 3_600_000, {
    message: `Durasi peminjaman maksimal ${rules.maxHours} jam`,
    path: ["endTime"],
  })
  .refine((v) => v.startTime.getTime() <= Date.now() + rules.maxDaysAhead * 86_400_000, {
    message: `Peminjaman maksimal ${rules.maxDaysAhead} hari ke depan`,
    path: ["startTime"],
  });

export const reviewBookingSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"], { error: "Status harus APPROVED atau REJECTED" }),
    adminNote: z.string().trim().max(2000, "Catatan admin maksimal 2000 karakter").optional(),
  })
  .refine((v) => v.status !== "REJECTED" || (v.adminNote && v.adminNote.length >= 3), {
    message: "Alasan penolakan wajib diisi (minimal 3 karakter)",
    path: ["adminNote"],
  });

export const adminCancelSchema = z.object({
  reason: z.string({ error: "Alasan pembatalan wajib diisi" }).trim().min(3, "Alasan pembatalan minimal 3 karakter").max(2000, "Alasan maksimal 2000 karakter"),
});
