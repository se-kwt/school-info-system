"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Modal } from "./Modal";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";

export interface SubjectRow {
  id: number;
  name: string;
  gradeId: number;
  versionCount: number;
  code?: string | null;
  creditHours?: number | null;
  weeklyPeriods?: number | null;
  isPractical?: boolean;
  isElective?: boolean;
}

type ModalState = { mode: "create" } | null;

const PAGE_SIZE = 8;

function versionLabel(count: number): string {
  return `${count} syllabus version${count === 1 ? "" : "s"}`;
}

export function GradeDetailView({
  gradeId,
  gradeName,
  initialSubjects,
}: {
  gradeId: number;
  gradeName: string;
  initialSubjects: SubjectRow[];
}) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [creditHours, setCreditHours] = useState("");
  const [weeklyPeriods, setWeeklyPeriods] = useState("");
  const [isPractical, setIsPractical] = useState(false);
  const [isElective, setIsElective] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch(`/api/grades/${gradeId}/subjects`);
    setSubjects(await response.json());
  }

  function openCreate() {
    setModalState({ mode: "create" });
    setName("");
    setCode("");
    setCreditHours("");
    setWeeklyPeriods("");
    setIsPractical(false);
    setIsElective(false);
    setError(null);
  }

  function closeModal() {
    setModalState(null);
    setError(null);
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch(`/api/grades/${gradeId}/subjects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        code: code || undefined,
        creditHours: creditHours ? Number(creditHours) : undefined,
        weeklyPeriods: weeklyPeriods ? Number(weeklyPeriods) : undefined,
        isPractical,
        isElective,
      }),
    });
    if (response.status === 201) {
      closeModal();
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/subjects/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleteBlockedId(null);
      setDeleteBlockedMessage(null);
      await refresh();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(id);
      setDeleteBlockedMessage(body.error);
      return;
    }
    setError(body.error);
  }

  const filteredSubjects = useMemo(
    () => subjects.filter((subject) => subject.name.toLowerCase().includes(search.toLowerCase())),
    [subjects, search]
  );
  const totalPages = Math.max(1, Math.ceil(filteredSubjects.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageSubjects = filteredSubjects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/grades"
        className="flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Grades
      </Link>

      <PageHeader
        icon={BookOpen}
        title={gradeName}
        subtitle={`${subjects.length} Subject${subjects.length === 1 ? "" : "s"}`}
        action={
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Add Subject
          </button>
        }
      />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search subjects..."
        view={view}
        onViewChange={setView}
      />

      {error && !modalState && <p className="text-sm text-red-600">{error}</p>}

      {pageSubjects.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No subjects found</p>}

      {pageSubjects.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageSubjects.map((subject) => (
            <EntityCard
              key={subject.id}
              icon={BookOpen}
              href={`/dashboard/grades/${gradeId}/subjects/${subject.id}`}
              title={subject.name}
              subtitle={versionLabel(subject.versionCount)}
              footerBadge={subject.isElective ? "Elective" : undefined}
              menuItems={[{ label: "Delete", destructive: true, onClick: () => handleDelete(subject.id) }]}
              blockedMessage={deleteBlockedId === subject.id ? (deleteBlockedMessage ?? undefined) : undefined}
              blockedActions={
                deleteBlockedId === subject.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteBlockedId(null);
                      setDeleteBlockedMessage(null);
                    }}
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

      {pageSubjects.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Name</th>
              <th className="border-b border-gray-200 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageSubjects.map((subject) => (
              <tr key={subject.id}>
                <td className="border-b border-gray-100 py-2">
                  <Link
                    href={`/dashboard/grades/${gradeId}/subjects/${subject.id}`}
                    className="text-blue-600 underline"
                  >
                    {subject.name}
                  </Link>
                  {subject.isElective && (
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                      Elective
                    </span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {deleteBlockedId === subject.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-700">{deleteBlockedMessage}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteBlockedId(null);
                          setDeleteBlockedMessage(null);
                        }}
                        className="rounded border border-amber-300 px-2 py-1 text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => handleDelete(subject.id)} className="text-red-600 underline">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={filteredSubjects.length}
        onPageChange={setPage}
        itemLabel="subjects"
      />

      {modalState && (
        <Modal onClose={closeModal} title="Add Subject">
          <h2 className="text-sm font-bold text-neutral-800">Add Subject</h2>
          <input
            type="text"
            aria-label="Subject name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Mathematics"
          />
          <input
            type="text"
            aria-label="Subject code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. MATH-101"
          />
          <input
            type="number"
            aria-label="Credit hours"
            value={creditHours}
            onChange={(event) => setCreditHours(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. 4"
          />
          <input
            type="number"
            aria-label="Weekly periods"
            value={weeklyPeriods}
            onChange={(event) => setWeeklyPeriods(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. 5"
          />
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              aria-label="Practical"
              checked={isPractical}
              onChange={(event) => setIsPractical(event.target.checked)}
            />
            Practical
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              aria-label="Elective"
              checked={isElective}
              onChange={(event) => setIsElective(event.target.checked)}
            />
            Elective
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
