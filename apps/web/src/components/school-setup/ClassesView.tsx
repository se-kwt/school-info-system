"use client";

import { Fragment, useState } from "react";

interface ClassRow {
  id: number;
  name: string;
  section: string;
  archived: boolean;
}

export function ClassesView({ initialClasses }: { initialClasses: ClassRow[] }) {
  const [classes, setClasses] = useState(initialClasses);
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
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
      body: JSON.stringify({ name, section }),
    });
    if (response.status === 201) {
      setName("");
      setSection("");
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(klass: ClassRow) {
    setEditingId(klass.id);
    setEditName(klass.name);
    setEditSection(klass.section);
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: editName, section: editSection }),
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

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          aria-label="Class name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="e.g. Grade 6"
        />
        <input
          type="text"
          aria-label="Section"
          value={section}
          onChange={(event) => setSection(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="e.g. B"
        />
        <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">
          Create Class
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Section</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((klass) => (
            <Fragment key={klass.id}>
              <tr>
                <td className="border-b border-gray-100 py-2">{klass.name}</td>
                <td className="border-b border-gray-100 py-2">{klass.section}</td>
                <td className="border-b border-gray-100 py-2">
                  {klass.archived && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Archived</span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  <button type="button" onClick={() => startEdit(klass)} className="mr-3 text-blue-600 underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(klass.id)} className="text-red-600 underline">
                    Delete
                  </button>
                </td>
              </tr>
              {editingId === klass.id && (
                <tr>
                  <td colSpan={4} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input
                        type="text"
                        aria-label={`Edit name for ${klass.name}`}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <input
                        type="text"
                        aria-label={`Edit section for ${klass.name}`}
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
                  <td colSpan={4} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2 text-sm">
                      <span>{klass.name} has history and cannot be permanently deleted.</span>
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
