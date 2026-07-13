export function StudentInfoBanner({
  name,
  className,
}: {
  name: string;
  className: string | null;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-base font-bold text-neutral-900">{name}</span>
      {className && <span className="text-xs font-semibold text-neutral-400">{className}</span>}
    </div>
  );
}
