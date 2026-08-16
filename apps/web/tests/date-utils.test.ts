import { describe, it, expect, vi, afterEach } from "vitest";
import { getSchoolLocalToday } from "../src/lib/date-utils";

describe("getSchoolLocalToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the IST calendar date, not the UTC one, for a time that has crossed midnight IST but not UTC", () => {
    // 2026-08-16T19:00:00Z is 2026-08-17T00:30:00 IST (UTC+5:30) -- already tomorrow in IST,
    // but toISOString().slice(0,10) on the raw UTC Date would incorrectly say "2026-08-16".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T19:00:00.000Z"));
    expect(getSchoolLocalToday()).toBe("2026-08-17");
  });

  it("returns the same calendar date as UTC when well within the UTC day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T08:00:00.000Z")); // 13:30 IST, same calendar day
    expect(getSchoolLocalToday()).toBe("2026-08-16");
  });
});
