import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "../src/lib/format";

describe("formatDate", () => {
  it("formats an ISO date as a readable date", () => {
    expect(formatDate("2026-09-01")).toBe("1 Sep 2026");
  });

  it("formats a Date object the same way", () => {
    expect(formatDate(new Date("2026-09-01T00:00:00.000Z"))).toBe("1 Sep 2026");
  });

  it("returns an em dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns an em dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns an em dash for an unparseable string", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("formats an ISO datetime as a readable date and time", () => {
    expect(formatDateTime("2026-09-01T00:00:00.000Z")).toMatch(/^1 Sep 2026, \d{2}:\d{2}/);
  });

  it("returns an em dash for null", () => {
    expect(formatDateTime(null)).toBe("—");
  });
});
