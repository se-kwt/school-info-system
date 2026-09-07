"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Modal } from "./Modal";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

export interface GradeRow {
  id: number;
  name: string;
  subjectCount: number;
  classCount: number;
  subjectNames: string[];
}

interface AcademicYearOption {
  id: number;
  name: string;
}

type ModalState = { id: number } | null;

const PAGE_SIZE = 8;

export function GradesView({
  initialGrades,
  academicYears,
}: {
  initialGrades: GradeRow[];
  academicYears: AcademicYearOption[];
}) {
  const [grades, setGrades] = useState(initialGrades);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function refresh(academicYearId: string) {
    const query = academicYearId !== "all" ? `?academicYearId=${academicYearId}` : "";
    const response = await fetch(`/api/grades${query}`);
    setGrades(await response.json());
  }

  function openEdit(grade: GradeRow) {
    setModalState({ id: grade.id });
    setName(grade.name);
    setError(null);
  }

  function closeModal() {
    setModalState(null);
    setError(null);
  }

  async function handleSave() {
    if (!modalState) return;
    setError(null);
    await run(async () => {
      const response = await fetch(`/api/grades/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        closeModal();
        await refresh(yearFilter);
        return;
      }
      setError((await response.json()).error);
    });
  }

  async function handleDelete(id: number) {
    setError(null);
    await run(async () => {
      const response = await fetch(`/api/grades/${id}`, { method: "DELETE" });
      if (response.ok) {
        setDeleteBlockedId(null);
        await refresh(yearFilter);
        return;
      }
      const body = await response.json();
      if (body.deletable === false) {
        setDeleteBlockedId(id);
        return;
      }
      setError(body.error);
    });
  }

  async function handleYearFilterChange(value: string) {
    setYearFilter(value);
    setPage(1);
    await refresh(value);
  }

  const filteredGrades = useMemo(
    () => grades.filter((grade) => grade.name.toLowerCase().includes(search.toLowerCase())),
    [grades, search]
  );
  const totalPages = Math.max(1, Math.ceil(filteredGrades.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGrades = filteredGrades.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const editingGrade = modalState ? grades.find((grade) => grade.id === modalState.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Layers}
        title="Grades"
        subtitle="Manage and organize all grades in your school"
        action={
          <Link
            href="/dashboard/grades/add"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Create Grade
          </Link>
        }
      />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search grades..."
        filterValue={yearFilter}
        onFilterChange={handleYearFilterChange}
        filterOptions={[
          { value: "all", label: "All Years" },
          ...academicYears.map((year) => ({ value: String(year.id), label: year.name })),
        ]}
        view={view}
        onViewChange={setView}
      />

      {error && !modalState && <p className="text-sm text-red-600">{error}</p>}

      {pageGrades.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No grades found</p>}

      {pageGrades.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageGrades.map((grade) => (
            <EntityCard
              key={grade.id}
              icon={Layers}
              href={`/dashboard/grades/${grade.id}`}
              title={grade.name}
              subtitle={`${grade.subjectCount} Subjects • ${grade.classCount} Classes`}
              tagLine={grade.subjectNames.length > 0 ? grade.subjectNames.join(", ") : "No subjects yet"}
              footerBadge={`Classes ${grade.classCount}`}
              onEdit={() => openEdit(grade)}
              menuItems={[{ label: "Delete", destructive: true, onClick: () => handleDelete(grade.id) }]}
              blockedMessage={
                deleteBlockedId === grade.id
                  ? `${grade.name} has subjects or classes and cannot be deleted.`
                  : undefined
              }
              blockedActions={
                deleteBlockedId === grade.id ? (
                  <button
                    type="button"
                    onClick={() => setDeleteBlockedId(null)}
                    className="rounded border border-amber-300 px-2 py-1 text-[11px]"
                  >
                    Cancel
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {pageGrades.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Name</th>
              <th className="border-b border-gray-200 pb-2">Subjects</th>
              <th className="border-b border-gray-200 pb-2">Classes</th>
              <th className="border-b border-gray-200 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageGrades.map((grade) => (
              <tr key={grade.id}>
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/grades/${grade.id}`} className="text-blue-600 underline">
                    {grade.name}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">{grade.subjectCount}</td>
                <td className="border-b border-gray-100 py-2">{grade.classCount}</td>
                <td className="border-b border-gray-100 py-2">
                  {deleteBlockedId === grade.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-700">
                        {grade.name} has subjects or classes and cannot be deleted.
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteBlockedId(null)}
                        className="rounded border border-amber-300 px-2 py-1 text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => openEdit(grade)} className="mr-3 text-blue-600 underline">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(grade.id)}
                        disabled={isSubmitting}
                        className="text-red-600 underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={currentPage} pageSize={PAGE_SIZE} total={filteredGrades.length} onPageChange={setPage} itemLabel="grades" />

      {modalState && (
        <Modal onClose={closeModal} title={editingGrade?.name ?? "Edit Grade"}>
          <h2 className="text-sm font-bold text-neutral-800">{editingGrade?.name}</h2>
          <input
            type="text"
            aria-label="Grade name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Grade 1"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
