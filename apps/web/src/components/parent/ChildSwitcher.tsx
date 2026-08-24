"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function sectionPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // Drop a trailing numeric segment: it identifies the current child's record,
  // and it is meaningless — or forbidden — for a different child.
  if (segments.length > 0 && /^\d+$/.test(segments[segments.length - 1])) {
    segments.pop();
  }
  return "/" + segments.join("/");
}

export function ChildSwitcher({
  students,
  activeStudentId,
}: {
  students: { id: number; name: string }[];
  activeStudentId: number;
}) {
  const pathname = usePathname();

  if (students.length <= 1) return null;

  const basePath = sectionPath(pathname);

  return (
    <div className="flex flex-wrap gap-2">
      {students.map((child) => {
        const isActive = child.id === activeStudentId;
        return (
          <Link
            key={child.id}
            href={`${basePath}?studentId=${child.id}`}
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
