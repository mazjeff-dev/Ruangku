import { z } from "zod";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Waktu harus berformat HH:mm");

export const operatingHoursSchema = z.object({
  hours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: time,
    closeTime: time,
    isClosed: z.boolean().default(false),
  })).length(7, "Atur jam untuk setiap hari dalam seminggu")
    .refine((hours) => new Set(hours.map((hour) => hour.dayOfWeek)).size === 7, "Hari tidak boleh berulang")
    .refine((hours) => hours.every((hour) => hour.isClosed || hour.closeTime > hour.openTime), "Jam tutup harus setelah jam buka"),
});

export const globalOperatingHoursSchema = z.object({
  openTime: time,
  closeTime: time,
  operatingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
}).refine((hours) => new Set(hours.operatingDays).size === hours.operatingDays.length, "Hari operasional tidak boleh berulang")
  .refine((hours) => hours.closeTime > hours.openTime, "Jam tutup harus setelah jam buka");

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD");

export const roomClosureSchema = z.object({
  roomId: z.number().int().positive().nullable().optional(),
  startDate: date,
  endDate: date,
  reason: z.string().trim().min(3, "Alasan penutupan minimal 3 karakter").max(500),
  confirmAffected: z.boolean().optional().default(false),
}).refine((closure) => closure.endDate >= closure.startDate, {
  message: "Tanggal selesai harus sama atau setelah tanggal mulai",
  path: ["endDate"],
});
