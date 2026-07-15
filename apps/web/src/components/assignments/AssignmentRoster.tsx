"use client";

import { useEffect, useRef, useState } from "react";

interface Assignment {
  id: number;
  subjectId: number;
  subjectName: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdById: number;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
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

async function uploadAttachment(
  file: File
): Promise<{ ok: true; attachmentUrl: string; attachmentName: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/assignments/upload", { method: "POST", body: formData });
  const body = await response.json();
  if (!response.ok) {
    return { ok: false, error: body.error };
  }
  return { ok: true, attachmentUrl: body.attachmentUrl, attachmentName: body.attachmentName };
}

export function AssignmentRoster({
  assignment,
  availableSubjects,
  role,
  currentUserId,
  onChanged,
}: {
  assignment: Assignment;
  availableSubjects: { id: number; name: string }[];
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
  const [editSubjectId, setEditSubjectId] = useState(String(assignment.subjectId));
  const [editDescription, setEditDescription] = useState(assignment.description ?? "");
  const [editDueDate, setEditDueDate] = useState(assignment.dueDate);
  const [editAttachmentFile, setEditAttachmentFile] = useState<File | null>(null);
  const [isSavingStatuses, setIsSavingStatuses] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const isSavingStatusesRef = useRef(false);
  const isSavingEditRef = useRef(false);

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
    setEditSubjectId(String(assignment.subjectId));
    setEditDescription(assignment.description ?? "");
    setEditDueDate(assignment.dueDate);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id]);

  async function handleSave() {
    if (isSavingStatusesRef.current) return;

    setError(null);
    setMessage(null);
    isSavingStatusesRef.current = true;
    setIsSavingStatuses(true);
    try {
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
    } finally {
      isSavingStatusesRef.current = false;
      setIsSavingStatuses(false);
    }
  }

  async function handleEditSave() {
    if (isSavingEditRef.current) return;

    setError(null);
    setMessage(null);

    if (!editSubjectId || !editTitle.trim() || !editDueDate) {
      setError("Subject, title, and due date are required");
      return;
    }

    isSavingEditRef.current = true;
    setIsSavingEdit(true);
    try {
      let attachmentUrl: string | undefined;
      let attachmentName: string | undefined;
      if (editAttachmentFile) {
        const uploadResult = await uploadAttachment(editAttachmentFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        attachmentUrl = uploadResult.attachmentUrl;
        attachmentName = uploadResult.attachmentName;
      }

      const response = await fetch(`/api/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          subjectId: Number(editSubjectId),
          description: editDescription || undefined,
          dueDate: editDueDate,
          attachmentUrl,
          attachmentName,
        }),
      });

      if (response.ok) {
        setMessage("Assignment updated");
        setEditing(false);
        setEditAttachmentFile(null);
        await refresh();
        onChanged();
        return;
      }
      const body = await response.json();
      setError(body.error);
    } finally {
      isSavingEditRef.current = false;
      setIsSavingEdit(false);
    }
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

      {assignment.attachmentUrl && (
        <a
          href={assignment.attachmentUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs font-semibold text-neutral-500 underline hover:text-neutral-800"
        >
          {assignment.attachmentName ?? "View attachment"}
        </a>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {message && <p className="mt-2 text-xs text-emerald-600">{message}</p>}

      {editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            aria-label="Edit subject"
            value={editSubjectId}
            onChange={(event) => setEditSubjectId(event.target.value)}
            className={inputClass}
          >
            {availableSubjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
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
          <input
            type="file"
            aria-label="Edit attachment"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(event) => setEditAttachmentFile(event.target.files?.[0] ?? null)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleEditSave}
            disabled={isSavingEdit}
            className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-semibold text-white transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingEdit ? "Saving…" : "Save Changes"}
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
          disabled={isSavingStatuses}
          className="mt-4 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSavingStatuses ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}
