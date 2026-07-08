import type { LucideIcon } from "lucide-react";

export function ComingSoon({ feature, icon: Icon }: { feature: string; icon: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-16 text-center shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-400">
        <Icon className="h-6 w-6" />
      </div>
      <h1 className="text-sm font-bold text-neutral-800">{feature}</h1>
      <p className="text-xs text-neutral-400">{feature} is coming soon.</p>
    </div>
  );
}
