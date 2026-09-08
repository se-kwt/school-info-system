"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UserCog } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";
import type { ClassRow } from "./ClassesView";

const PAGE_SIZE = 8;

function enrollmentLabel(klass: ClassRow): string | undefined {
  if (klass.enrolledCount === undefined) return undefined;
  return klass.capacity != null ? `${klass.enrolledCount} / ${klass.capacity}` : `${klass.enrolledCount}`;
}

function classTitle(klass: ClassRow): string {
  return `${klass.gradeName} · Section ${klass.section}`;
}

export function FacultyAssignmentClassesView({ initialClasses }: { initialClasses: ClassRow[] }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const filteredClasses = useMemo(
    () => initialClasses.filter((klass) => classTitle(klass).toLowerCase().includes(search.toLowerCase())),
    [initialClasses, search]
  );
  const totalPages = Math.max(1, Math.ceil(filteredClasses.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageClasses = filteredClasses.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={UserCog}
        title="Faculty Assignment"
        subtitle="Select a class to assign teachers to its subjects"
      />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search classes..."
        view={view}
        onViewChange={setView}
      />

      {pageClasses.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No classes found</p>}

      {pageClasses.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageClasses.map((klass) => (
            <EntityCard
              key={klass.id}
              icon={UserCog}
              href={`/dashboard/faculty-assignment/${klass.id}`}
              title={classTitle(klass)}
              subtitle={enrollmentLabel(klass) ?? "No enrollment data"}
              menuItems={[]}
            />
          ))}
        </div>
      )}

      {pageClasses.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Grade</th>
              <th className="border-b border-gray-200 pb-2">Section</th>
            </tr>
          </thead>
          <tbody>
            {pageClasses.map((klass) => (
              <tr key={klass.id}>
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/faculty-assignment/${klass.id}`} className="text-blue-600 underline">
                    {klass.gradeName}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">{klass.section}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={filteredClasses.length}
        onPageChange={setPage}
        itemLabel="classes"
      />
    </div>
  );
}
