"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

interface ClassRow {
  id: number;
  gradeId: number;
  gradeName: string;
  section: string;
  academicYearId: number;
  archived: boolean;
}

interface GradeOption {
  id: number;
  name: string;
}

interface AcademicYearOption {
  id: number;
  name: string;
}

export function ClassesView({
  initialClasses,
  grades,
  academicYears,
}: {
  initialClasses: ClassRow[];
  grades: GradeOption[];
  academicYears: AcademicYearOption[];
}) {
  const [classes, setClasses] = useState(initialClasses);
  const [gradeId, setGradeId] = useState(grades[0] ? String(grades[0].id) : "");
  const [section, setSection] = useState("");
  const [academicYearId, setAcademicYearId] = useState(academicYears[0] ? String(academicYears[0].id) : "");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSection, setEditSection] = useState("");
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/classes?includeArchived=true");
    setClasses(await response.json());
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch("/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gradeId: Number(gradeId), section, academicYearId: Number(academicYearId) }),
    });
    if (response.status === 201) {
      setSection("");
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(klass: ClassRow) {
    setEditingId(klass.id);
    setEditSection(klass.section);
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: editSection }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleteBlockedId(null);
      await refresh();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(id);
      return;
    }
    setError(body.error);
  }

  async function handleArchive(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}/archive`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setDeleteBlockedId(null);
    await refresh();
  }

  async function handleUnarchive(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}/unarchive`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Grade"
          value={gradeId}
          onChange={(event) => setGradeId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {grades.map((grade) => (
            <option key={grade.id} value={grade.id}>
              {grade.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Section"
          value={section}
          onChange={(event) => setSection(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="e.g. B"
        />
        <select
          aria-label="Academic year"
          value={academicYearId}
          onChange={(event) => setAcademicYearId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {academicYears.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">
          Create Class
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Grade</th>
            <th className="border-b border-gray-200 pb-2">Section</th>
            <th className="border-b border-gray-200 pb-2">Year</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((klass) => (
            <Fragment key={klass.id}>
              <tr>
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/classes/${klass.id}`} className="text-blue-600 underline">
                    {klass.gradeName}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">{klass.section}</td>
                <td className="border-b border-gray-100 py-2">
                  {academicYears.find((y) => y.id === klass.academicYearId)?.name ?? klass.academicYearId}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {klass.archived && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Archived</span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  <button type="button" onClick={() => startEdit(klass)} className="mr-3 text-blue-600 underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(klass.id)} className="mr-3 text-red-600 underline">
                    Delete
                  </button>
                  {klass.archived && (
                    <button type="button" onClick={() => handleUnarchive(klass.id)} className="text-green-700 underline">
                      Unarchive
                    </button>
                  )}
                </td>
              </tr>
              {editingId === klass.id && (
                <tr>
                  <td colSpan={5} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input
                        type="text"
                        aria-label={`Edit section for ${klass.gradeName}`}
                        value={editSection}
                        onChange={(event) => setEditSection(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(klass.id)}
                        className="rounded bg-blue-600 px-2 py-1 text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {deleteBlockedId === klass.id && (
                <tr>
                  <td colSpan={5} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2 text-sm">
                      <span>{klass.gradeName} {klass.section} has history and cannot be permanently deleted.</span>
                      <button
                        type="button"
                        onClick={() => handleArchive(klass.id)}
                        className="rounded bg-amber-600 px-2 py-1 text-white"
                      >
                        Archive instead
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteBlockedId(null)}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
