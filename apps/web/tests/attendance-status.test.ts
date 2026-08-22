import { describe, it, expect } from "vitest";
import {
  cycleAttendanceStatus,
  attendanceWeight,
  type AttendanceStatusValue,
} from "../src/lib/attendance-status";

describe("cycleAttendanceStatus", () => {
  it("cycles null -> present -> absent -> late -> half_day -> excused -> holiday -> null", () => {
    expect(cycleAttendanceStatus(null)).toBe("present");
    expect(cycleAttendanceStatus("present")).toBe("absent");
    expect(cycleAttendanceStatus("absent")).toBe("late");
    expect(cycleAttendanceStatus("late")).toBe("half_day");
    expect(cycleAttendanceStatus("half_day")).toBe("excused");
    expect(cycleAttendanceStatus("excused")).toBe("holiday");
    expect(cycleAttendanceStatus("holiday")).toBe(null);
  });

  it("cycles through every markable status", () => {
    let s: AttendanceStatusValue = null;
    const seen: AttendanceStatusValue[] = [];
    for (let i = 0; i < 7; i++) {
      s = cycleAttendanceStatus(s);
      seen.push(s);
    }
    expect(seen).toEqual(["present", "absent", "late", "half_day", "excused", "holiday", null]);
  });
});

describe("attendanceWeight", () => {
  it("weights each status correctly", () => {
    expect(attendanceWeight("present")).toEqual({ counted: true, credit: 1 });
    expect(attendanceWeight("late")).toEqual({ counted: true, credit: 1 });
    expect(attendanceWeight("half_day")).toEqual({ counted: true, credit: 0.5 });
    expect(attendanceWeight("absent")).toEqual({ counted: true, credit: 0 });
    expect(attendanceWeight("excused")).toEqual({ counted: false, credit: 0 });
    expect(attendanceWeight("holiday")).toEqual({ counted: false, credit: 0 });
  });
});
