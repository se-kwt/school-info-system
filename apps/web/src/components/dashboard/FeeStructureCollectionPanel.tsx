import type { FeeStructureCollectionEntry } from "@/lib/dashboard/overview";
import { formatMoney } from "@/lib/money";

const BAR_COLORS = ["#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#3B82F6"];

export function FeeStructureCollectionPanel({
  feeStructureCollection,
}: {
  feeStructureCollection: FeeStructureCollectionEntry[];
}) {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5 xl:col-span-8">
      <div className="mb-4 border-b border-neutral-100 pb-4">
        <h3 className="text-sm font-bold text-neutral-800">Fee Structure Collection</h3>
        <p className="text-[11px] text-neutral-400">Collected vs. due, per fee structure</p>
      </div>
      {feeStructureCollection.length === 0 ? (
        <p className="text-xs text-neutral-400">No fee structures created yet.</p>
      ) : (
        <div className="space-y-3">
          {feeStructureCollection.map((fs, index) => (
            <div key={fs.id} className="rounded-xl p-1.5">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                <span className="truncate text-[11px] font-medium text-neutral-700">
                  {fs.className} — {fs.term}
                </span>
                <span className="font-mono text-[11px] font-bold text-neutral-800">
                  {fs.collectionPercent}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${fs.collectionPercent}%`,
                    backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
                  }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-neutral-400">
                {formatMoney(fs.totalPaid)} of {formatMoney(fs.totalDue)} collected
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
