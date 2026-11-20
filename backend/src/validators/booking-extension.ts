import { z } from "zod";

export const requestExtensionSchema = z.object({
  requestedEndTime: z.string({ error: "Waktu selesai baru wajib diisi" })
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Waktu selesai baru tidak valid")
    .transform((value) => new Date(value)),
});

export const reviewExtensionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], { error: "Status harus APPROVED atau REJECTED" }),
  note: z.string().trim().max(2000, "Catatan maksimal 2000 karakter").optional(),
}).refine((value) => value.status !== "REJECTED" || (value.note && value.note.length >= 3), {
  message: "Alasan penolakan wajib diisi (minimal 3 karakter)",
  path: ["note"],
});
