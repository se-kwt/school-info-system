import Link from "next/link";
import type { StaffOverviewEntry } from "@/lib/dashboard/overview";

export function StaffOverviewPanel({
  staffCapacityPercent,
  staffOverview,
}: {
  staffCapacityPercent: number;
  staffOverview: StaffOverviewEntry[];
}) {
  const circumference = 2 * Math.PI * 45;
  const dash = (staffCapacityPercent / 100) * circumference;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5 xl:col-span-4">
      <div className="mb-3 border-b border-neutral-100 pb-3">
        <h3 className="text-sm font-bold text-neutral-800">Staff Overview</h3>
        <p className="text-[10px] text-neutral-400">
          Classes with attendance marked today: {staffCapacityPercent}%
        </p>
      </div>

      <div className="relative flex items-center justify-center py-2">
        <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#F1F5F9" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#3B82F6"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <span className="absolute text-lg font-bold text-neutral-800">{staffCapacityPercent}%</span>
      </div>

      <ul className="mt-2 space-y-2">
        {staffOverview.length === 0 && (
          <li className="text-xs text-neutral-400">No teachers assigned yet.</li>
        )}
        {staffOverview.map((staff) => (
          <li key={staff.userId} className="flex items-center justify-between text-xs">
            <span className="truncate font-medium text-neutral-700">{staff.name}</span>
            <span className="text-neutral-400">
              {staff.classCount} class{staff.classCount === 1 ? "" : "es"}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/dashboard/staff"
        className="mt-4 block rounded-lg border border-neutral-200/60 py-1.5 text-center text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
      >
        View Full Staff Directory
      </Link>
    </div>
  );
}
