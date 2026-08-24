import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { getParentAssignmentDetail } from "@/lib/parent/assignments-history";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { formatDate } from "@/lib/format";

const STATUS_BADGE: Record<"pending" | "submitted" | "overdue", string> = {
  pending: "bg-amber-50 text-amber-600",
  submitted: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-500",
};

function isImageAttachment(url: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(url);
}

export default async function ParentAssignmentDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ studentId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
  const assignmentId = Number(params.id);
  const assignment = Number.isNaN(assignmentId)
    ? null
    : await getParentAssignmentDetail(prisma, { studentId: activeChild.id, assignmentId });

  return (
    <div className="space-y-4">
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <Link
        href={`/parent/assignments?studentId=${activeChild.id}`}
        className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
      >
        ← Pending assignments
      </Link>

      {!assignment ? (
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-16 text-center">
          <p className="text-sm font-bold text-neutral-800">Assignment not found</p>
          <p className="mt-1 text-xs text-neutral-400">
            It may not belong to this student, or no longer exists.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-sm font-bold text-neutral-800">{assignment.title}</h1>
              <p className="mt-1 text-xs text-neutral-400">
                {assignment.subjectName} · {assignment.className} · Due {formatDate(assignment.dueDate)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[assignment.status]}`}
            >
              {assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)}
            </span>
          </div>

          {assignment.description && (
            <p className="mt-4 text-xs text-neutral-600">{assignment.description}</p>
          )}

          {assignment.attachmentUrl && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Attachment
              </p>
              {isImageAttachment(assignment.attachmentUrl) ? (
                <a href={assignment.attachmentUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assignment.attachmentUrl}
                    alt={assignment.attachmentName ?? "Assignment attachment"}
                    className="max-h-80 rounded-lg border border-neutral-200 object-contain"
                  />
                </a>
              ) : (
                <a
                  href={assignment.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs font-semibold text-neutral-600 underline hover:text-neutral-900"
                >
                  {assignment.attachmentName ?? "View attachment"}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
