import Link from "next/link";

export function ChildSwitcher({
  students,
  activeStudentId,
}: {
  students: { id: number; name: string }[];
  activeStudentId: number;
}) {
  if (students.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {students.map((child) => {
        const isActive = child.id === activeStudentId;
        return (
          <Link
            key={child.id}
            href={`/parent?studentId=${child.id}`}
            aria-current={isActive ? "true" : undefined}
            className={
              isActive
                ? "rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all"
                : "rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-500 transition-all hover:bg-neutral-50"
            }
          >
            {child.name}
          </Link>
        );
      })}
    </div>
  );
}
