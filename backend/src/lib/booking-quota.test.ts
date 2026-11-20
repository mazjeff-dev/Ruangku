import { describe, expect, it } from "vitest";
import { assertBookingNotBlocked, assertBookingQuota, assertQueueQuota, getUserBookingQuota } from "./booking-quota";
import { HttpError } from "./http";

describe("booking quota", () => {
  it("counts only active bookings and waiting queue entries", async () => {
    const db = {
      booking: { count: async () => 2 },
      bookingQueue: { count: async () => 1 },
    } as never;

    await expect(getUserBookingQuota(db, 7, { maxActiveBookings: 3, maxQueueEntries: 3 }))
      .resolves.toMatchObject({
        activeBookings: 2,
        remainingBookings: 1,
        activeQueueEntries: 1,
        remainingQueueEntries: 2,
      });
  });

  it("rejects a user who has reached the active booking limit", () => {
    expect(() => assertBookingQuota({
      activeBookings: 3,
      maxActiveBookings: 3,
      remainingBookings: 0,
      activeQueueEntries: 0,
      maxQueueEntries: 3,
      remainingQueueEntries: 3,
    })).toThrowError(new HttpError(409, "Anda sudah memiliki 3 peminjaman aktif. Selesaikan atau batalkan salah satu."));
  });

  it("rejects a user who has reached the waiting queue limit", () => {
    expect(() => assertQueueQuota({
      activeBookings: 0,
      maxActiveBookings: 3,
      remainingBookings: 3,
      activeQueueEntries: 3,
      maxQueueEntries: 3,
      remainingQueueEntries: 0,
    })).toThrowError(new HttpError(409, "Anda sudah memiliki 3 entri antrean aktif. Batalkan salah satu sebelum bergabung lagi."));
  });

  it("allows bookings after a suspension has expired", async () => {
    const now = new Date("2026-11-10T10:00:00.000Z");
    const tx = {
      user: { findUniqueOrThrow: async () => ({ bookingBlockedUntil: new Date(now.getTime() - 1) }) },
    } as never;

    await expect(assertBookingNotBlocked(tx, 7, now)).resolves.toBeUndefined();
  });

  it("rejects bookings while a suspension is active", async () => {
    const now = new Date("2026-11-10T10:00:00.000Z");
    const tx = {
      user: { findUniqueOrThrow: async () => ({ bookingBlockedUntil: new Date(now.getTime() + 1) }) },
    } as never;

    await expect(assertBookingNotBlocked(tx, 7, now)).rejects.toMatchObject({ status: 403 });
  });
});
