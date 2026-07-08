import type { LucideIcon } from "lucide-react";

export function KpiCard({
  icon: Icon,
  colorClassName,
  value,
  label,
}: {
  icon: LucideIcon;
  colorClassName: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${colorClassName}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
          {value}
        </span>
        <span className="text-[11px] font-semibold text-neutral-400">{label}</span>
      </div>
    </div>
  );
}
