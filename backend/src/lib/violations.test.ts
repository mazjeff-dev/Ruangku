import { describe, expect, it } from "vitest";
import { calculateOverstayMinutes } from "./violations";

describe("calculateOverstayMinutes", () => {
  const endTime = new Date("2026-11-10T10:00:00.000Z");

  it("returns zero when checked out on time or early", () => {
    expect(calculateOverstayMinutes(endTime, new Date("2026-11-10T09:59:00.000Z"))).toBe(0);
    expect(calculateOverstayMinutes(endTime, endTime)).toBe(0);
  });

  it("rounds a partial late minute up", () => {
    expect(calculateOverstayMinutes(endTime, new Date("2026-11-10T10:00:01.000Z"))).toBe(1);
    expect(calculateOverstayMinutes(endTime, new Date("2026-11-10T10:02:00.000Z"))).toBe(2);
  });
});
