"use client";

import { useEffect, useState } from "react";

interface Assignment {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdById: number;
}

interface StatusEntry {
  studentId: number;
  name: string;
  status: "pending" | "submitted" | "overdue";
}

export function AssignmentRoster({
  assignment,
  role,
  currentUserId,
  onChanged,
}: {
  assignment: Assignment;
  role: "teacher" | "admin";
  currentUserId: number;
  onChanged: () => void;
}) {
  const [statuses, setStatuses] = useState<StatusEntry[]>([]);
  const [edits, setEdits] = useState<Record<number, "pending" | "submitted">>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(assignment.title);
  const [editSubject, setEditSubject] = useState(assignment.subject);
  const [editDescription, setEditDescription] = useState(assignment.description ?? "");
  const [editDueDate, setEditDueDate] = useState(assignment.dueDate);

  async function refresh() {
    const response = await fetch(`/api/assignments/${assignment.id}/statuses`);
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      setStatuses([]);
      return;
    }
    const body = await response.json();
    setStatuses(body.statuses);
    const editMap: Record<number, "pending" | "submitted"> = {};
    for (const entry of body.statuses as StatusEntry[]) {
      editMap[entry.studentId] = entry.status === "overdue" ? "pending" : entry.status;
    }
    setEdits(editMap);
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    setEditing(false);
    setEditTitle(assignment.title);
    setEditSubject(assignment.subject);
    setEditDescription(assignment.description ?? "");
    setEditDueDate(assignment.dueDate);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id]);

  async function handleSave() {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: statuses.map((entry) => ({
          studentId: entry.studentId,
          status: edits[entry.studentId] ?? "pending",
        })),
      }),
    });

    if (response.ok) {
      setMessage("Statuses saved");
      await refresh();
      onChanged();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  async function handleEditSave() {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/assignments/${assignment.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        subject: editSubject,
        description: editDescription || undefined,
        dueDate: editDueDate,
      }),
    });

    if (response.ok) {
      setMessage("Assignment updated");
      setEditing(false);
      await refresh();
      onChanged();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  const canEdit = role === "teacher" && assignment.createdById === currentUserId;

  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-800">{assignment.title}</h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-gray-300 px-3 py-1 text-sm"
          >
            Edit
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

      {editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="text"
            aria-label="Edit subject"
            value={editSubject}
            onChange={(event) => setEditSubject(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="text"
            aria-label="Edit title"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="text"
            aria-label="Edit description"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="date"
            aria-label="Edit due date"
            value={editDueDate}
            onChange={(event) => setEditDueDate(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={handleEditSave}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          >
            Save Changes
          </button>
        </div>
      )}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((entry) => (
            <tr key={entry.studentId}>
              <td className="border-b border-gray-100 py-2">{entry.name}</td>
              <td className="border-b border-gray-100 py-2">
                {role === "teacher" ? (
                  <select
                    aria-label={`Status for ${entry.name}`}
                    value={edits[entry.studentId] ?? "pending"}
                    onChange={(event) =>
                      setEdits((prev) => ({
                        ...prev,
                        [entry.studentId]: event.target.value as "pending" | "submitted",
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    <option value="pending">Pending</option>
                    <option value="submitted">Submitted</option>
                  </select>
                ) : (
                  <span
                    className={
                      entry.status === "overdue"
                        ? "text-red-600"
                        : entry.status === "submitted"
                          ? "text-green-600"
                          : "text-amber-600"
                    }
                  >
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </span>
                )}
                {role === "teacher" && entry.status === "overdue" && (
                  <span className="ml-2 text-xs text-red-600">(overdue)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {role === "teacher" && (
        <button
          type="button"
          onClick={handleSave}
          className="mt-4 rounded bg-blue-600 px-3 py-2 text-white"
        >
          Save
        </button>
      )}
    </div>
  );
}
