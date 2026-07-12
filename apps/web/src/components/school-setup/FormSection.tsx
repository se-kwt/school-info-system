export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </div>
  );
}
