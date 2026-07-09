"use client";

import type { AttendanceStatusValue } from "@/lib/attendance-status";

const STATUS_STYLES: Record<"present" | "absent" | "late" | "null", string> = {
  present: "border-emerald-300 bg-emerald-50",
  absent: "border-red-300 bg-red-50",
  late: "border-amber-300 bg-amber-50",
  null: "border-neutral-200 bg-white",
};

const STATUS_LABEL: Record<"present" | "absent" | "late" | "null", string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  null: "Unmarked",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function StudentAttendanceCard({
  name,
  rollNumber,
  photoUrl,
  status,
  onClick,
}: {
  name: string;
  rollNumber: string;
  photoUrl: string | null;
  status: AttendanceStatusValue;
  onClick: () => void;
}) {
  const key = status ?? "null";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Attendance for ${name}, currently ${STATUS_LABEL[key]}`}
      className={`flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center transition-all ${STATUS_STYLES[key]}`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={name} className="h-14 w-14 rounded-full object-cover" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-sm font-bold text-neutral-600">
          {initials(name)}
        </span>
      )}
      <span className="text-xs font-semibold text-neutral-800">{name}</span>
      <span className="text-[11px] text-neutral-500">Roll No. {rollNumber}</span>
      <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
        {STATUS_LABEL[key]}
      </span>
    </button>
  );
}
