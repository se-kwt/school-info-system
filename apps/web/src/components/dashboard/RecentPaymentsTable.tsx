import type { RecentPaymentEntry } from "@/lib/dashboard/overview";

export function RecentPaymentsTable({ recentPayments }: { recentPayments: RecentPaymentEntry[] }) {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5 xl:col-span-4">
      <div className="mb-3 border-b border-neutral-100 pb-3">
        <h3 className="text-sm font-bold text-neutral-800">Recent Payments</h3>
        <p className="text-[11px] text-neutral-400">Latest recorded payments</p>
      </div>
      {recentPayments.length === 0 ? (
        <p className="text-xs text-neutral-400">No payments recorded yet.</p>
      ) : (
        <ul className="space-y-3">
          {recentPayments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-700">{payment.studentName}</p>
                <p className="truncate text-[10px] text-neutral-400">
                  {payment.className} · {payment.paidDate ?? "—"}
                </p>
              </div>
              <span className="shrink-0 font-mono font-bold text-emerald-600">
                ₹{payment.amountPaid}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
