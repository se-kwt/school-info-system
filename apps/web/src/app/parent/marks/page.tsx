import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { getParentMarksHistory } from "@/lib/parent/marks-history";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { ExamBreakdown } from "@/components/parent/ExamBreakdown";

export default async function ParentMarksPage(
  props: {
    searchParams: Promise<{ studentId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const claims = await requireParentRole();
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
  const exams = await getParentMarksHistory(prisma, activeChild.id);

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
        <h1 className="mb-3 text-sm font-bold text-neutral-800">Marks</h1>
        {exams.length === 0 ? (
          <p className="text-xs text-neutral-400">No exams recorded yet</p>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => (
              <ExamBreakdown
                key={exam.examId}
                examName={`${exam.examName} (${exam.term})`}
                subjects={exam.subjects}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
