import type { ParentAssignmentEntry, ParentAttendanceDay, ParentOverview } from "@/lib/parent/overview";

const cardClass =
  "rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]";
const labelClass = "text-[11px] font-semibold text-neutral-400";
const titleClass = "mb-2 text-xs font-bold text-neutral-800";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const ATTENDANCE_STATUS_CLASS: Record<"present" | "late" | "absent", string> = {
  present: "bg-emerald-100 text-emerald-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-700",
};

function LegendDot({ colorClassName, label }: { colorClassName: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[9px] text-neutral-400">
      <span className={`h-2 w-2 rounded-full ${colorClassName}`} />
      {label}
    </span>
  );
}

export function AttendanceCard({ percent, days }: { percent: number; days: ParentAttendanceDay[] }) {
  const leadingBlanks = days.length > 0 ? days[0].weekday : 0;

  return (
    <div className={cardClass}>
      <p className={titleClass}>Attendance</p>
      <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
        {percent}%
      </span>
      <span className={labelClass}>This month</span>
      <div className="mt-3 grid grid-cols-7 gap-1">
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
            className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ${
              day.status ? ATTENDANCE_STATUS_CLASS[day.status] : "bg-neutral-100 text-neutral-400"
            }`}
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
    </div>
  );
}

export function AssignmentsCard({ assignments }: { assignments: ParentAssignmentEntry[] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Assignments</p>
      {assignments.length === 0 ? (
        <p className={labelClass}>No pending assignments</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="text-xs">
              <p className="font-semibold text-neutral-800">{assignment.title}</p>
              <p className={assignment.status === "overdue" ? "text-red-600" : "text-neutral-400"}>
                {assignment.dueDate} · {assignment.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MarksCard({ latestExam }: { latestExam: ParentOverview["latestExam"] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Marks</p>
      {latestExam === null ? (
        <p className={labelClass}>No exams recorded yet</p>
      ) : (
        <div>
          <p className="mb-1 text-xs font-semibold text-neutral-800">{latestExam.examName}</p>
          <ul className="space-y-1">
            {latestExam.subjects.map((subject) => (
              <li key={subject.subject} className={labelClass}>
                {subject.subject}: {subject.marksObtained}/{subject.maxMarks} ({subject.grade})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FeesCard({ fees }: { fees: ParentOverview["feesOutstanding"] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Fees</p>
      {fees.amount === 0 ? (
        <p className="text-sm font-bold text-emerald-600">No dues</p>
      ) : (
        <div>
          <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
            ₹{fees.amount}
          </span>
          {fees.nearestDueDate && (
            <span className="text-[11px] font-semibold text-amber-600">Due {fees.nearestDueDate}</span>
          )}
        </div>
      )}
    </div>
  );
}
