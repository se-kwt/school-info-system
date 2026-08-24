import type { ParentAssignmentEntry, ParentAttendanceDay, ParentOverview } from "@/lib/parent/overview";
import { MonthCalendar } from "./MonthCalendar";
import { ExamBreakdown } from "./ExamBreakdown";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";

const cardClass =
  "rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]";
const labelClass = "text-[11px] font-semibold text-neutral-400";
const titleClass = "mb-2 text-xs font-bold text-neutral-800";

export function AttendanceCard({ percent, days }: { percent: number; days: ParentAttendanceDay[] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Attendance Summary</p>
      <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
        {percent}%
      </span>
      <span className={labelClass}>This month</span>
      <div className="mt-3">
        <MonthCalendar days={days} />
      </div>
    </div>
  );
}

export function AssignmentsCard({ assignments }: { assignments: ParentAssignmentEntry[] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Pending Assignments</p>
      {assignments.length === 0 ? (
        <p className={labelClass}>No pending assignments</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="text-xs">
              <p className="font-semibold text-neutral-800">{assignment.title}</p>
              <p className={assignment.status === "overdue" ? "text-red-600" : "text-neutral-400"}>
                {formatDate(assignment.dueDate)} · {assignment.status}
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
      <p className={titleClass}>Marks / Exam Results</p>
      {latestExam === null ? (
        <p className={labelClass}>No exams recorded yet</p>
      ) : (
        <ExamBreakdown examName={latestExam.examName} subjects={latestExam.subjects} />
      )}
    </div>
  );
}

export function FeesCard({ fees }: { fees: ParentOverview["feesOutstanding"] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Fee Due Status</p>
      {fees.amount === 0 ? (
        <p className="text-sm font-bold text-emerald-600">No dues</p>
      ) : (
        <div>
          <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
            {formatMoney(fees.amount)}
          </span>
          {fees.nearestDueDate && (
            <span className="text-[11px] font-semibold text-amber-600">Due {formatDate(fees.nearestDueDate)}</span>
          )}
        </div>
      )}
    </div>
  );
}
