import { afterEach, describe, expect, it, vi } from "vitest";
import { conflictWhere } from "../src/lib/booking";
import { createBookingSchema } from "../src/validators/booking";

const rules = { minMinutes: 30, maxHours: 8, maxDaysAhead: 90 };
const now = new Date("2026-11-05T00:00:00.000Z");
const validBooking = (startTime: Date, endTime: Date) => ({
  roomId: 12,
  title: "Rapat kelompok",
  purpose: "Diskusi tugas kelompok",
  attendees: 4,
  startTime: startTime.toISOString(),
  endTime: endTime.toISOString(),
});

describe("booking time policy", () => {
  afterEach(() => vi.useRealTimers());

  it("builds the strict overlap query and excludes the reviewed booking", () => {
    const start = new Date("2026-11-06T08:00:00.000Z");
    const end = new Date("2026-11-06T09:00:00.000Z");
    expect(conflictWhere({ roomId: 12, start, end, statuses: ["PENDING", "APPROVED"], excludeId: 8 }))
      .toEqual({
        roomId: 12,
        status: { in: ["PENDING", "APPROVED"] },
        startTime: { lt: end },
        endTime: { gt: start },
        id: { not: 8 },
      });
  });

  it("accepts the minimum and maximum durations and rejects out-of-range durations", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const schema = createBookingSchema(rules);
    const start = new Date(now.getTime() + 60 * 60_000);

    expect(schema.safeParse(validBooking(start, new Date(start.getTime() + 30 * 60_000))).success).toBe(true);
    expect(schema.safeParse(validBooking(start, new Date(start.getTime() + 29 * 60_000))).success).toBe(false);
    expect(schema.safeParse(validBooking(start, new Date(start.getTime() + 8 * 60 * 60_000))).success).toBe(true);
    expect(schema.safeParse(validBooking(start, new Date(start.getTime() + 8 * 60 * 60_000 + 1))).success).toBe(false);
  });

  it("enforces the maximum number of days in advance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const schema = createBookingSchema(rules);
    const lastAllowedStart = new Date(now.getTime() + rules.maxDaysAhead * 86_400_000);

    expect(schema.safeParse(validBooking(lastAllowedStart, new Date(lastAllowedStart.getTime() + 30 * 60_000))).success).toBe(true);
    expect(schema.safeParse(validBooking(
      new Date(lastAllowedStart.getTime() + 1),
      new Date(lastAllowedStart.getTime() + 30 * 60_000 + 1),
    )).success).toBe(false);
  });
});
