import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildrenWithClass, getParentOverview } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { StudentInfoBanner } from "@/components/parent/StudentInfoBanner";
import { AttendanceCard, AssignmentsCard, MarksCard, FeesCard } from "@/components/parent/SummaryCards";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: { studentId?: string };
}) {
  const claims = await requireParentRole();
  const children = await getParentChildrenWithClass(prisma, claims.userId);

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

  const overview = await getParentOverview(prisma, {
    studentId: activeChild.id,
    schoolId: claims.schoolId,
  });

  return (
    <div className="space-y-4">
      <StudentInfoBanner name={activeChild.name} className={activeChild.className} />
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`/parent/assignments?studentId=${activeChild.id}`}
          className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300"
        >
          <AssignmentsCard assignments={overview.upcomingAssignments} />
        </Link>
        <Link
          href={`/parent/attendance?studentId=${activeChild.id}`}
          className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300"
        >
          <AttendanceCard percent={overview.attendanceMonthPercent} days={overview.attendanceDays} />
        </Link>
        <Link
          href={`/parent/fees?studentId=${activeChild.id}`}
          className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300"
        >
          <FeesCard fees={overview.feesOutstanding} />
        </Link>
        <Link
          href={`/parent/marks?studentId=${activeChild.id}`}
          className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300"
        >
          <MarksCard latestExam={overview.latestExam} />
        </Link>
      </div>
    </div>
  );
}
