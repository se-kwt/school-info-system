"use client";

import Link from "next/link";
import { useState } from "react";

interface SubjectRow {
  id: number;
  name: string;
  gradeId: number;
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
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch(`/api/grades/${gradeId}/subjects`);
    setSubjects(await response.json());
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch(`/api/grades/${gradeId}/subjects`, {
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

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/subjects/${id}`, { method: "DELETE" });
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
      <p className="text-sm text-gray-500">Subjects for {gradeName}</p>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          aria-label="Subject name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="e.g. Mathematics"
        />
        <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">
          Add Subject
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject) => (
            <tr key={subject.id}>
              <td className="border-b border-gray-100 py-2">
                <Link href={`/dashboard/grades/${gradeId}/subjects/${subject.id}`} className="text-blue-600 underline">
                  {subject.name}
                </Link>
              </td>
              <td className="border-b border-gray-100 py-2">
                <button type="button" onClick={() => handleDelete(subject.id)} className="text-red-600 underline">
                  Delete
                </button>
                {deleteBlockedId === subject.id && (
                  <span className="ml-3 text-xs text-amber-600">Has syllabus or scheduling history.</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
