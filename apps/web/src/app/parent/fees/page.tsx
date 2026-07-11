import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { getParentFeesHistory } from "@/lib/parent/fees-history";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";

const STATUS_CLASS: Record<"paid" | "partial" | "unpaid", string> = {
  paid: "text-emerald-600",
  partial: "text-amber-600",
  unpaid: "text-red-600",
};

export default async function ParentFeesPage({
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
  const activeChild = resolveActiveChild(children, requestedId);
  const feeHistory = await getParentFeesHistory(prisma, activeChild.id);

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
        <h1 className="mb-3 text-sm font-bold text-neutral-800">Fees</h1>
        {feeHistory.length === 0 ? (
          <p className="text-xs text-neutral-400">No fee structures yet</p>
        ) : (
          <ul className="space-y-2">
            {feeHistory.map((fee) => (
              <li key={fee.id} className="border-b border-neutral-50 pb-2 text-xs last:border-0">
                <p className="font-semibold text-neutral-800">
                  {fee.term} · {fee.className} · {fee.academicYearName}
                </p>
                <p className={STATUS_CLASS[fee.status]}>
                  ₹{fee.amountPaid}/₹{fee.amount} · {fee.status} · Due {fee.dueDate}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
