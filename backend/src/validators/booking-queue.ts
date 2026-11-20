import { z } from "zod";

export const cancelQueueEntrySchema = z.object({
  reason: z.string().trim().min(3, "Alasan pembatalan minimal 3 karakter").max(500, "Alasan pembatalan maksimal 500 karakter"),
});
