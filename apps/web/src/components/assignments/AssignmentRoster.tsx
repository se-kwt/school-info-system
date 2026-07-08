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

const STATUS_BADGE: Record<StatusEntry["status"], string> = {
  pending: "bg-amber-50 text-amber-600",
  submitted: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-500",
};

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none";

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
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-neutral-800">{assignment.title}</h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
          >
            Edit
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {message && <p className="mt-2 text-xs text-emerald-600">{message}</p>}

      {editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            aria-label="Edit subject"
            value={editSubject}
            onChange={(event) => setEditSubject(event.target.value)}
            className={inputClass}
          />
          <input
            type="text"
            aria-label="Edit title"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            className={inputClass}
          />
          <input
            type="text"
            aria-label="Edit description"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
            className={inputClass}
          />
          <input
            type="date"
            aria-label="Edit due date"
            value={editDueDate}
            onChange={(event) => setEditDueDate(event.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleEditSave}
            className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Save Changes
          </button>
        </div>
      )}

      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
            <th className="border-b border-neutral-100 pb-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((entry) => (
            <tr key={entry.studentId}>
              <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                {entry.name}
              </td>
              <td className="border-b border-neutral-50 py-2 pr-4">
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
                    className={inputClass}
                  >
                    <option value="pending">Pending</option>
                    <option value="submitted">Submitted</option>
                  </select>
                ) : (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[entry.status]}`}>
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </span>
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
          className="mt-4 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Save
        </button>
      )}
    </div>
  );
}
