import { describe, it, expect } from "vitest";
import { cycleAttendanceStatus } from "../src/lib/attendance-status";

describe("cycleAttendanceStatus", () => {
  it("cycles null -> present -> absent -> late -> null", () => {
    expect(cycleAttendanceStatus(null)).toBe("present");
    expect(cycleAttendanceStatus("present")).toBe("absent");
    expect(cycleAttendanceStatus("absent")).toBe("late");
    expect(cycleAttendanceStatus("late")).toBe(null);
  });
});
