export type AttendanceStatusValue = "present" | "absent" | "late" | null;

const CYCLE_ORDER: AttendanceStatusValue[] = [null, "present", "absent", "late"];

export function cycleAttendanceStatus(current: AttendanceStatusValue): AttendanceStatusValue {
  const currentIndex = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length];
}
