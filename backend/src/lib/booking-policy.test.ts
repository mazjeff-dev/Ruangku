import { describe, expect, it } from "vitest";
import { HttpError } from "./http";
import { assertAttendeeCapacity } from "./booking-policy";
import { validateOperatingHours } from "./operating-hours";

describe("booking attendee and operating-hour policy", () => {
  it("accepts attendee counts within capacity and reports the room limit", () => {
    expect(() => assertAttendeeCapacity(40, 40)).not.toThrow();
    expect(() => assertAttendeeCapacity(41, 40)).toThrow("Jumlah peserta melebihi kapasitas ruangan (maks. 40)");
    expect(() => assertAttendeeCapacity(0, 40)).toThrow("Jumlah peserta minimal 1");
  });

  it("uses WIB boundaries inclusively and rejects times outside operating hours", () => {
    const hours = { openTime: "07:00", closeTime: "21:00", isClosed: false, closures: [] };
    expect(() => validateOperatingHours(
      new Date("2026-11-09T00:00:00.000Z"),
      new Date("2026-11-09T14:00:00.000Z"),
      hours
    )).not.toThrow();
    expect(() => validateOperatingHours(
      new Date("2026-11-09T13:00:00.000Z"),
      new Date("2026-11-09T14:01:00.000Z"),
      hours
    )).toThrow("07:00–21:00 WIB");
  });

  it("rejects closures and bookings crossing the Jakarta date boundary", () => {
    expect(() => validateOperatingHours(
      new Date("2026-11-09T03:00:00.000Z"),
      new Date("2026-11-09T04:00:00.000Z"),
      { openTime: "07:00", closeTime: "21:00", isClosed: false, closures: [{ reason: "Perawatan" }] }
    )).toThrow("Ruangan ditutup: Perawatan");
    try {
      validateOperatingHours(
        new Date("2026-11-09T16:30:00.000Z"),
        new Date("2026-11-09T17:30:00.000Z"),
        { openTime: null, closeTime: null, isClosed: false, closures: [] }
      );
      throw new Error("expected cross-day booking to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as Error).message).toContain("melintasi tengah malam");
    }
  });
});
