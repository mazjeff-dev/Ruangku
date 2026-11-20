import { describe, expect, it } from "vitest";
import { canReviewBooking } from "../src/lib/authorization";

describe("lecturer booking review scope", () => {
  it("allows a lecturer to review only bookings for assigned rooms", () => {
    expect(canReviewBooking("DOSEN", 10, 20, 3, [3, 5])).toBe(true);
    expect(canReviewBooking("DOSEN", 10, 20, 4, [3, 5])).toBe(false);
  });

  it("prevents lecturers from reviewing their own bookings", () => {
    expect(canReviewBooking("DOSEN", 10, 10, 3, [3])).toBe(false);
  });

  it("keeps the admin override and denies students", () => {
    expect(canReviewBooking("ADMIN", 1, 20, 99, [])).toBe(true);
    expect(canReviewBooking("STUDENT", 20, 30, 3, [3])).toBe(false);
  });
});
