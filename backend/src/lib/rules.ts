import { prisma } from "./prisma";

// Nilai environment tetap menjadi default jika admin belum menyimpan override.
export const bookingRules = {
  minMinutes: Number(process.env.BOOKING_MIN_MINUTES) || 30,
  maxHours: Number(process.env.BOOKING_MAX_HOURS) || 8,
  maxDaysAhead: Number(process.env.BOOKING_MAX_DAYS_AHEAD) || 90,
  maxActiveBookings: 3,
  maxQueueEntries: 3,
  gracePeriodMinutes: 15,
  noShowPoints: 2,
  overstayPoints: 1,
  lateCancelPoints: 1,
  suspendThreshold: 5,
  suspendDays: 7,
  lateCancelWindowMinutes: 30,
};

export type BookingRules = typeof bookingRules;

export async function getEffectiveBookingRules(): Promise<BookingRules> {
  const saved = await prisma.bookingRuleSetting.findUnique({
    where: { id: 1 },
    select: {
      minMinutes: true,
      maxHours: true,
      maxDaysAhead: true,
      maxActiveBookings: true,
      maxQueueEntries: true,
      gracePeriodMinutes: true,
      noShowPoints: true,
      overstayPoints: true,
      lateCancelPoints: true,
      suspendThreshold: true,
      suspendDays: true,
      lateCancelWindowMinutes: true,
    },
  });
  return saved ?? bookingRules;
}
