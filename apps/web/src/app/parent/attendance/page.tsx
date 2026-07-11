import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { getParentAttendanceMonth } from "@/lib/parent/attendance-history";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { MonthCalendar } from "@/components/parent/MonthCalendar";

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: { studentId?: string; month?: string };
}) {
  const claims = requireParentRole();
  const children = await getParentChildren(prisma, claims.userId);

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-16 text-center">
        <p className="text-sm font-bold text-neutral-800">No students linked to this account</p>
        <p className="mt-1 text-xs text-neutral-400">Contact the school office to link your child.</p>
      </div>
    );
  }

  const requestedId = searchParams.studentId ? Number(searchParams.studentId) : undefined;
  const activeChild = resolveActiveChild(children, requestedId);

  const monthData = await getParentAttendanceMonth(prisma, {
    studentId: activeChild.id,
    month: searchParams.month,
  });

  const hasRecords = monthData.days.some((day) => day.status !== null);

  return (
    <div className="space-y-4">
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <Link
        href={`/parent?studentId=${activeChild.id}`}
        className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
      >
        ← Overview
      </Link>
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={`/parent/attendance?studentId=${activeChild.id}&month=${monthData.prevMonth}`}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
          >
            ‹ Prev
          </Link>
          <div className="text-center">
            <p className="text-sm font-bold text-neutral-800">{monthData.monthLabel}</p>
            <p className="text-xs text-neutral-400">{monthData.percent}% attendance</p>
          </div>
          <Link
            href={`/parent/attendance?studentId=${activeChild.id}&month=${monthData.nextMonth}`}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
          >
            Next ›
          </Link>
        </div>
        {hasRecords ? (
          <MonthCalendar days={monthData.days} />
        ) : (
          <p className="text-xs text-neutral-400">No attendance recorded for this month</p>
        )}
      </div>
    </div>
  );
}
