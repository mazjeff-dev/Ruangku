import { z } from "zod";

export const attendanceActionSchema = z.object({}).strict();

export const waiveViolationSchema = z.object({
  note: z.string().trim().min(3, "Catatan pembatalan poin wajib diisi").max(500),
});
