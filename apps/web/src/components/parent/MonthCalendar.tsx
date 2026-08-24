import type { ParentAttendanceDay } from "@/lib/parent/overview";
import { formatDate } from "@/lib/format";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const ATTENDANCE_STATUS_CLASS: Record<
  "present" | "late" | "absent" | "half_day" | "excused" | "holiday",
  string
> = {
  present: "bg-emerald-100 text-emerald-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-700",
  half_day: "bg-sky-100 text-sky-700",
  excused: "bg-violet-100 text-violet-700",
  holiday: "bg-neutral-200 text-neutral-600",
};

function LegendDot({ colorClassName, label }: { colorClassName: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[9px] text-neutral-400">
      <span className={`h-2 w-2 rounded-full ${colorClassName}`} />
      {label}
    </span>
  );
}

export function MonthCalendar({ days }: { days: ParentAttendanceDay[] }) {
  const leadingBlanks = days.length > 0 ? days[0].weekday : 0;
  const daysWithNotes = days.filter((day) => day.note);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} className="text-center text-[9px] font-semibold text-neutral-400">
            {label}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <span key={`blank-${index}`} data-testid="calendar-blank" />
        ))}
        {days.map((day) => (
          <span
            key={day.date}
            title={day.note ?? undefined}
            className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ${
              day.status ? ATTENDANCE_STATUS_CLASS[day.status] : "bg-neutral-100 text-neutral-400"
            } ${day.note ? "ring-1 ring-neutral-400" : ""}`}
          >
            {day.dayOfMonth}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <LegendDot colorClassName="bg-emerald-400" label="Present" />
        <LegendDot colorClassName="bg-amber-400" label="Late" />
        <LegendDot colorClassName="bg-red-400" label="Absent" />
        <LegendDot colorClassName="bg-neutral-300" label="No record" />
      </div>
      {daysWithNotes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-2">
          {daysWithNotes.map((day) => (
            <li key={day.date} className="text-[11px] text-neutral-500">
              <span className="font-semibold text-neutral-700">{formatDate(day.date)}</span>: {day.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
