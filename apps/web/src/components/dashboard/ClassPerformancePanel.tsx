import type { ClassPerformanceEntry, AttendanceTrendPoint } from "@/lib/dashboard/overview";

const BAR_COLORS = ["#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#3B82F6"];

export function ClassPerformancePanel({
  classPerformance,
  attendanceTrend,
}: {
  classPerformance: ClassPerformanceEntry[];
  attendanceTrend: AttendanceTrendPoint[];
}) {
  const trendByClass = new Map<number, AttendanceTrendPoint[]>();
  for (const point of attendanceTrend) {
    const list = trendByClass.get(point.classId) ?? [];
    list.push(point);
    trendByClass.set(point.classId, list);
  }
  const dates = Array.from(new Set(attendanceTrend.map((p) => p.date))).sort();

  return (
    <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5 xl:col-span-8">
      <div className="mb-4 border-b border-neutral-100 pb-4">
        <h3 className="text-sm font-bold text-neutral-800">Class Performance</h3>
        <p className="text-[11px] text-neutral-400">Attendance rate, last 30 days</p>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-5 md:grid-cols-12">
        <div className="space-y-3 border-neutral-100 md:col-span-5 md:border-r md:pr-5">
          {classPerformance.length === 0 && (
            <p className="text-xs text-neutral-400">No classes to show yet.</p>
          )}
          {classPerformance.map((klass, index) => (
            <div key={klass.classId} className="rounded-xl p-1.5">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                    style={{ backgroundColor: BAR_COLORS[index % BAR_COLORS.length] }}
                  >
                    {klass.name[0]}
                  </span>
                  <span className="truncate text-[11px] font-medium text-neutral-700">
                    {klass.name} {klass.section}
                  </span>
                </div>
                <span className="font-mono text-[11px] font-bold text-neutral-800">
                  {klass.attendancePercent}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${klass.attendancePercent}%`,
                    backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col justify-between md:col-span-7">
          <div className="mb-1.5 text-[11px] font-bold text-neutral-500">Attendance Trend</div>
          {dates.length === 0 ? (
            <p className="text-xs text-neutral-400">
              No attendance recorded in the last 5 school days.
            </p>
          ) : (
            <>
              <svg className="h-[140px] w-full" viewBox="0 0 320 130" preserveAspectRatio="none">
                <line x1="0" y1="10" x2="320" y2="10" stroke="#E2E8F0" strokeDasharray="3 3" />
                <line x1="0" y1="45" x2="320" y2="45" stroke="#E2E8F0" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="320" y2="80" stroke="#E2E8F0" strokeDasharray="3 3" />
                <line x1="0" y1="115" x2="320" y2="115" stroke="#E2E8F0" strokeDasharray="3 3" />
                {Array.from(trendByClass.entries()).map(([classId, points], index) => {
                  const pointByDate = new Map(points.map((p) => [p.date, p.percent]));
                  const path = dates
                    .map((date, i) => {
                      const percent = pointByDate.get(date);
                      const x = (i / Math.max(dates.length - 1, 1)) * 320;
                      const y = percent === undefined ? 115 : 115 - (percent / 100) * 105;
                      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                    })
                    .join(" ");
                  return (
                    <path
                      key={classId}
                      d={path}
                      fill="none"
                      stroke={BAR_COLORS[index % BAR_COLORS.length]}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  );
                })}
              </svg>
              <div className="mt-1 flex justify-between px-2 text-[9px] font-bold text-neutral-400">
                {dates.map((date) => (
                  <span key={date}>{date.slice(5)}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
