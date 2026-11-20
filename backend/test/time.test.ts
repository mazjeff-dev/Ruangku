import { describe, expect, it } from "vitest";
import { formatJakarta, jakartaDateKey, parseJakartaDate, startOfNextJakartaMonth } from "../src/lib/time";

describe("Jakarta time helpers", () => {
  it("converts a WIB calendar date to UTC midnight and back", () => {
    const date = parseJakartaDate("2026-11-05");
    expect(date?.toISOString()).toBe("2026-11-04T17:00:00.000Z");
    expect(jakartaDateKey(date!)).toBe("2026-11-05");
    expect(jakartaDateKey(new Date("2026-11-04T16:59:59.999Z"))).toBe("2026-11-04");
  });

  it("rejects impossible calendar dates", () => {
    expect(parseJakartaDate("2026-02-31")).toBeNull();
    expect(parseJakartaDate("05-11-2026")).toBeNull();
  });

  it("formats the date and time in Asia/Jakarta", () => {
    const formatted = formatJakarta(new Date("2026-11-05T03:05:00.000Z"));
    expect(formatted).toContain("05 Nov 2026");
    expect(formatted).toContain("10.05");
  });

  it("advances month boundaries using the WIB calendar", () => {
    expect(startOfNextJakartaMonth(new Date("2026-11-30T20:00:00.000Z")).toISOString())
      .toBe("2026-12-31T17:00:00.000Z");
  });
});
