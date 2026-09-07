export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <h1 className="mb-2 text-sm font-bold text-neutral-800">{title}</h1>
      <p className="text-xs text-neutral-400">{description}</p>
      <p className="mt-4 inline-block rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
        Coming soon
      </p>
    </div>
  );
}
