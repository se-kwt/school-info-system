"use client";

import { useEffect, useRef, useState } from "react";
import { AssignmentRoster } from "./AssignmentRoster";

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

interface Assignment {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdById: number;
  submittedCount: number;
  totalCount: number;
  hasOverdue: boolean;
}

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

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

export function AssignmentsView({
  classes,
  role,
  currentUserId,
}: {
  classes: ClassOption[];
  role: "teacher" | "admin";
  currentUserId: number;
}) {
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  async function refresh() {
    if (!classId) return;
    const response = await fetch(`/api/assignments?classId=${classId}`);
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      setAssignments([]);
      return;
    }
    const body = await response.json();
    setAssignments(body.assignments);
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    setSelectedId(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function handleCreate() {
    if (isSubmittingRef.current) return;

    setError(null);
    setMessage(null);

    if (!subject.trim() || !title.trim() || !dueDate) {
      setError("Subject, title, and due date are required");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      let attachmentUrl: string | undefined;
      let attachmentName: string | undefined;
      if (attachmentFile) {
        const uploadResult = await uploadAttachment(attachmentFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        attachmentUrl = uploadResult.attachmentUrl;
        attachmentName = uploadResult.attachmentName;
      }

      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId: Number(classId),
          subject,
          title,
          description: description || undefined,
          dueDate,
          attachmentUrl,
          attachmentName,
        }),
      });

      if (response.ok) {
        setMessage("Assignment posted");
        setSubject("");
        setTitle("");
        setDescription("");
        setDueDate("");
        setAttachmentFile(null);
        await refresh();
        return;
      }
      const body = await response.json();
      setError(body.error);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <select
        aria-label="Class"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        className="w-fit rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none"
      >
        {classes.map((klass) => (
          <option key={klass.id} value={klass.id}>
            {klass.name} {klass.section}
          </option>
        ))}
      </select>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}

      {role === "teacher" && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
          <input
            type="text"
            aria-label="Subject"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className={inputClass}
          />
          <input
            type="text"
            aria-label="Title"
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
          <input
            type="text"
            aria-label="Description"
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={inputClass}
          />
          <input
            type="date"
            aria-label="Due date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className={inputClass}
          />
          <input
            type="file"
            aria-label="Attachment"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isSubmitting}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Posting…" : "New Assignment"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Title</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Subject</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Due date</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr
                key={assignment.id}
                onClick={() => setSelectedId(assignment.id)}
                className="cursor-pointer hover:bg-neutral-50"
              >
                <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                  {assignment.title}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {assignment.subject}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {assignment.dueDate}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      assignment.hasOverdue
                        ? "bg-red-50 text-red-500"
                        : assignment.submittedCount === assignment.totalCount
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {assignment.submittedCount}/{assignment.totalCount} submitted
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <AssignmentRoster
          assignment={selected}
          role={role}
          currentUserId={currentUserId}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
