import { z } from "zod";

export const bookingRuleSettingsSchema = z
  .object({
    minMinutes: z.coerce.number().int().min(1).max(1440),
    maxHours: z.coerce.number().int().min(1).max(168),
    maxDaysAhead: z.coerce.number().int().min(1).max(365),
    maxActiveBookings: z.coerce.number().int().min(1).max(20),
    maxQueueEntries: z.coerce.number().int().min(1).max(20),
    gracePeriodMinutes: z.coerce.number().int().min(0).max(180),
    noShowPoints: z.coerce.number().int().min(0).max(100),
    overstayPoints: z.coerce.number().int().min(0).max(100),
    lateCancelPoints: z.coerce.number().int().min(0).max(100),
    suspendThreshold: z.coerce.number().int().min(1).max(100),
    suspendDays: z.coerce.number().int().min(1).max(365),
    lateCancelWindowMinutes: z.coerce.number().int().min(0).max(1440),
  })
  .refine((rules) => rules.minMinutes <= rules.maxHours * 60, {
    message: "Durasi minimum tidak boleh melebihi durasi maksimum",
    path: ["minMinutes"],
  });
