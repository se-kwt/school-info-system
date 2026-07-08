import type { TimetablePeriodEntry } from "@/lib/dashboard/overview";

export function TodaysTimetablePanel({
  todaysTimetable,
}: {
  todaysTimetable: TimetablePeriodEntry[];
}) {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5 xl:col-span-4">
      <div className="mb-3 border-b border-neutral-100 pb-3">
        <h3 className="text-sm font-bold text-neutral-800">Today&apos;s Timetable</h3>
        <p className="text-[11px] text-neutral-400">Periods in order</p>
      </div>
      {todaysTimetable.length === 0 ? (
        <p className="text-xs text-neutral-400">No periods scheduled today.</p>
      ) : (
        <ul className="space-y-3">
          {todaysTimetable.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 text-xs">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-600">
                P{entry.period}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-neutral-700">{entry.subject}</p>
                <p className="truncate text-[10px] text-neutral-400">
                  {entry.className} · {entry.teacherName ?? "No teacher assigned"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
