"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Modal } from "./Modal";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";
import type { KebabMenuItem } from "./KebabMenu";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

export interface ClassRow {
  id: number;
  gradeId: number;
  gradeName: string;
  section: string;
  academicYearId: number;
  archived: boolean;
  capacity?: number | null;
  room?: string | null;
  enrolledCount?: number;
}

interface AcademicYearOption {
  id: number;
  name: string;
}

type ModalState = { id: number } | null;

const PAGE_SIZE = 8;

function enrollmentLabel(klass: ClassRow): string | undefined {
  if (klass.enrolledCount === undefined) return undefined;
  return klass.capacity != null ? `${klass.enrolledCount} / ${klass.capacity}` : `${klass.enrolledCount}`;
}

export function ClassesView({
  initialClasses,
  academicYears,
}: {
  initialClasses: ClassRow[];
  academicYears: AcademicYearOption[];
}) {
  const [classes, setClasses] = useState(initialClasses);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [section, setSection] = useState("");
  const [capacity, setCapacity] = useState("");
  const [room, setRoom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function refresh(academicYearIdFilter: string) {
    const params = new URLSearchParams({ includeArchived: "true" });
    if (academicYearIdFilter !== "all") params.set("academicYearId", academicYearIdFilter);
    const response = await fetch(`/api/classes?${params.toString()}`);
    setClasses(await response.json());
  }

  function openEdit(klass: ClassRow) {
    setModalState({ id: klass.id });
    setSection(klass.section);
    setCapacity(klass.capacity != null ? String(klass.capacity) : "");
    setRoom(klass.room ?? "");
    setError(null);
  }

  function closeModal() {
    setModalState(null);
    setError(null);
  }

  async function handleSave() {
    if (!modalState) return;
    setError(null);

    if (!section.trim()) {
      setError("Section is required");
      return;
    }
    if (capacity && Number(capacity) <= 0) {
      setError("Capacity must be greater than 0");
      return;
    }

    await run(async () => {
      const response = await fetch(`/api/classes/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section,
          capacity: capacity ? Number(capacity) : undefined,
          room: room || undefined,
        }),
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
      const response = await fetch(`/api/classes/${id}`, { method: "DELETE" });
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

  async function handleArchive(id: number) {
    setError(null);
    await run(async () => {
      const response = await fetch(`/api/classes/${id}/archive`, { method: "PATCH" });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      setDeleteBlockedId(null);
      await refresh(yearFilter);
    });
  }

  async function handleUnarchive(id: number) {
    setError(null);
    await run(async () => {
      const response = await fetch(`/api/classes/${id}/unarchive`, { method: "PATCH" });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      await refresh(yearFilter);
    });
  }

  async function handleYearFilterChange(value: string) {
    setYearFilter(value);
    setPage(1);
    await refresh(value);
  }

  const filteredClasses = useMemo(
    () =>
      classes.filter((klass) =>
        `${klass.gradeName} Section ${klass.section}`.toLowerCase().includes(search.toLowerCase())
      ),
    [classes, search]
  );
  const totalPages = Math.max(1, Math.ceil(filteredClasses.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageClasses = filteredClasses.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Building2}
        title="Classes"
        subtitle="Manage and organize all classes in your school"
        action={
          <Link
            href="/dashboard/classes/add"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Create Class
          </Link>
        }
      />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search classes..."
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

      {pageClasses.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No classes found</p>}

      {pageClasses.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageClasses.map((klass) => {
            const yearName = academicYears.find((year) => year.id === klass.academicYearId)?.name ?? String(klass.academicYearId);
            const menuItems: KebabMenuItem[] = [
              { label: "Delete", destructive: true, onClick: () => handleDelete(klass.id) },
              klass.archived
                ? { label: "Unarchive", onClick: () => handleUnarchive(klass.id) }
                : { label: "Archive", onClick: () => handleArchive(klass.id) },
            ];
            const title = `${klass.gradeName} · Section ${klass.section}`;
            return (
              <EntityCard
                key={klass.id}
                icon={Building2}
                href={`/dashboard/classes/${klass.id}`}
                title={title}
                subtitle={yearName}
                tagLine={enrollmentLabel(klass)}
                footerBadge={klass.archived ? "Archived" : undefined}
                onEdit={() => openEdit(klass)}
                menuItems={menuItems}
                blockedMessage={
                  deleteBlockedId === klass.id
                    ? `${klass.gradeName} ${klass.section} has history and cannot be permanently deleted.`
                    : undefined
                }
                blockedActions={
                  deleteBlockedId === klass.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleArchive(klass.id)}
                        disabled={isSubmitting}
                        className="rounded bg-amber-600 px-2 py-1 text-[11px] text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Archive instead
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteBlockedId(null)}
                        className="rounded border border-amber-300 px-2 py-1 text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {pageClasses.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Grade</th>
              <th className="border-b border-gray-200 pb-2">Section</th>
              <th className="border-b border-gray-200 pb-2">Year</th>
              <th className="border-b border-gray-200 pb-2">Roster</th>
              <th className="border-b border-gray-200 pb-2">Status</th>
              <th className="border-b border-gray-200 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageClasses.map((klass) => (
              <tr key={klass.id}>
                <td className="border-b border-gray-100 py-2">{klass.gradeName}</td>
                <td className="border-b border-gray-100 py-2">{klass.section}</td>
                <td className="border-b border-gray-100 py-2">
                  {academicYears.find((year) => year.id === klass.academicYearId)?.name ?? klass.academicYearId}
                </td>
                <td className="border-b border-gray-100 py-2">{enrollmentLabel(klass)}</td>
                <td className="border-b border-gray-100 py-2">
                  {klass.archived && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Archived</span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {deleteBlockedId === klass.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-700">
                        {klass.gradeName} {klass.section} has history and cannot be permanently deleted.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleArchive(klass.id)}
                        disabled={isSubmitting}
                        className="rounded bg-amber-600 px-2 py-1 text-[11px] text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Archive instead
                      </button>
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
                      <button type="button" onClick={() => openEdit(klass)} className="mr-3 text-blue-600 underline">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(klass.id)}
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

      <Pagination page={currentPage} pageSize={PAGE_SIZE} total={filteredClasses.length} onPageChange={setPage} itemLabel="classes" />

      {modalState && (
        <Modal onClose={closeModal} title="Edit Class">
          <h2 className="text-sm font-bold text-neutral-800">Edit Class</h2>
          <input
            type="text"
            aria-label="Section"
            value={section}
            onChange={(event) => setSection(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. B"
          />
          <input
            type="number"
            min="1"
            aria-label="Capacity"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. 40"
          />
          <input
            type="text"
            aria-label="Room"
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. B-204"
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
