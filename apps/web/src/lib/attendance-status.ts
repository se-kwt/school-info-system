export type AttendanceStatusValue =
  | "present"
  | "absent"
  | "late"
  | "half_day"
  | "excused"
  | "holiday"
  | null;

const CYCLE_ORDER: AttendanceStatusValue[] = [
  null,
  "present",
  "absent",
  "late",
  "half_day",
  "excused",
  "holiday",
];

export function cycleAttendanceStatus(current: AttendanceStatusValue): AttendanceStatusValue {
  const currentIndex = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length];
}

export function attendanceWeight(
  status: Exclude<AttendanceStatusValue, null>
): { counted: boolean; credit: number } {
  switch (status) {
    case "present":
    case "late":
      return { counted: true, credit: 1 };
    case "half_day":
      return { counted: true, credit: 0.5 };
    case "absent":
      return { counted: true, credit: 0 };
    case "excused":
    case "holiday":
      return { counted: false, credit: 0 };
  }
}
