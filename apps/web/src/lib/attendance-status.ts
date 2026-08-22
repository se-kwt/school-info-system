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

export function attendancePercent(
  records: Array<{ status: Exclude<AttendanceStatusValue, null> | string }>
): number {
  const weighted = records.reduce(
    (acc, r) => {
      const { counted, credit } = attendanceWeight(
        r.status as Exclude<AttendanceStatusValue, null>
      );
      return counted ? { total: acc.total + 1, credit: acc.credit + credit } : acc;
    },
    { total: 0, credit: 0 }
  );
  return weighted.total === 0 ? 0 : Math.round((weighted.credit / weighted.total) * 100);
}
