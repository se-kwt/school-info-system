export function FormSection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-xs font-bold text-indigo-600">
          {number}
        </span>
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}
