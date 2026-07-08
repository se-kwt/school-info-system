import type { AssignmentDueEntry } from "@/lib/dashboard/overview";

const STATUS_CLASSES: Record<AssignmentDueEntry["status"], string> = {
  pending: "bg-amber-50 text-amber-600",
  submitted: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-500",
};

export function AssignmentsDueTable({ assignmentsDue }: { assignmentsDue: AssignmentDueEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5 xl:col-span-8">
      <div className="mb-3 border-b border-neutral-100 pb-3">
        <h3 className="text-sm font-bold text-neutral-800">Assignments Due</h3>
        <p className="text-[11px] text-neutral-400">Nearest due dates across your classes</p>
      </div>
      {assignmentsDue.length === 0 ? (
        <p className="text-xs text-neutral-400">Nothing due in the next few days.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Class</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Assignment</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Due date</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {assignmentsDue.map((assignment) => (
              <tr key={assignment.id}>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {assignment.className}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {assignment.title}
                  <span className="ml-1 text-neutral-400">({assignment.subject})</span>
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {assignment.dueDate}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASSES[assignment.status]}`}
                  >
                    {assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
