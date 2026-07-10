import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren, getParentOverview } from "@/lib/parent/overview";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { AttendanceCard, AssignmentsCard, MarksCard, FeesCard } from "@/components/parent/SummaryCards";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: { studentId?: string };
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
  const activeChild =
    children.find((child) => child.id === requestedId) ?? children[0];

  const overview = await getParentOverview(prisma, {
    studentId: activeChild.id,
    schoolId: claims.schoolId,
  });

  return (
    <div className="space-y-4">
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AttendanceCard percent={overview.attendanceMonthPercent} />
        <AssignmentsCard assignments={overview.upcomingAssignments} />
        <MarksCard latestExam={overview.latestExam} />
        <FeesCard fees={overview.feesOutstanding} />
      </div>
    </div>
  );
}
