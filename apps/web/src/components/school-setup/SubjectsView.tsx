"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";
import type { GradeRow } from "./GradesView";

const PAGE_SIZE = 8;

function subjectLabel(count: number): string {
  return `${count} Subject${count === 1 ? "" : "s"}`;
}

export function SubjectsView({ initialGrades }: { initialGrades: GradeRow[] }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const filteredGrades = useMemo(
    () => initialGrades.filter((grade) => grade.name.toLowerCase().includes(search.toLowerCase())),
    [initialGrades, search]
  );
  const totalPages = Math.max(1, Math.ceil(filteredGrades.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGrades = filteredGrades.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={BookMarked} title="Subjects" subtitle="Select a grade to view its subjects" />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search grades..."
        view={view}
        onViewChange={setView}
      />

      {pageGrades.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No grades found</p>}

      {pageGrades.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageGrades.map((grade) => (
            <EntityCard
              key={grade.id}
              icon={BookMarked}
              href={`/dashboard/subjects/${grade.id}`}
              title={grade.name}
              subtitle={subjectLabel(grade.subjectCount)}
              menuItems={[]}
            />
          ))}
        </div>
      )}

      {pageGrades.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Grade</th>
              <th className="border-b border-gray-200 pb-2">Subjects</th>
            </tr>
          </thead>
          <tbody>
            {pageGrades.map((grade) => (
              <tr key={grade.id}>
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/subjects/${grade.id}`} className="text-blue-600 underline">
                    {grade.name}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">{grade.subjectCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={filteredGrades.length}
        onPageChange={setPage}
        itemLabel="grades"
      />
    </div>
  );
}
