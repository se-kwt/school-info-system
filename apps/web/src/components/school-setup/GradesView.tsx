"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

interface GradeRow {
  id: number;
  name: string;
  subjectCount: number;
  classCount: number;
}

export function GradesView({ initialGrades }: { initialGrades: GradeRow[] }) {
  const [grades, setGrades] = useState(initialGrades);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/grades");
    setGrades(await response.json());
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch("/api/grades", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.status === 201) {
      setName("");
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(grade: GradeRow) {
    setEditingId(grade.id);
    setEditName(grade.name);
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);
    const response = await fetch(`/api/grades/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: editName }),
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
    const response = await fetch(`/api/grades/${id}`, { method: "DELETE" });
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

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          aria-label="Grade name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="e.g. Grade 1"
        />
        <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">
          Create Grade
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Subjects</th>
            <th className="border-b border-gray-200 pb-2">Classes</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {grades.map((grade) => (
            <Fragment key={grade.id}>
              <tr>
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/grades/${grade.id}`} className="text-blue-600 underline">
                    {grade.name}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">{grade.subjectCount}</td>
                <td className="border-b border-gray-100 py-2">{grade.classCount}</td>
                <td className="border-b border-gray-100 py-2">
                  <button type="button" onClick={() => startEdit(grade)} className="mr-3 text-blue-600 underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(grade.id)} className="text-red-600 underline">
                    Delete
                  </button>
                </td>
              </tr>
              {editingId === grade.id && (
                <tr>
                  <td colSpan={4} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input
                        type="text"
                        aria-label={`Edit name for ${grade.name}`}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(grade.id)}
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
              {deleteBlockedId === grade.id && (
                <tr>
                  <td colSpan={4} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2 text-sm">
                      <span>{grade.name} has subjects or classes and cannot be deleted.</span>
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
