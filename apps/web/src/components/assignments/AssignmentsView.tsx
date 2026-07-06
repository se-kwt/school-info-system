"use client";

import { useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    setError(null);
    setMessage(null);
    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: Number(classId),
        subject,
        title,
        description: description || undefined,
        dueDate,
      }),
    });

    if (response.ok) {
      setMessage("Assignment posted");
      setSubject("");
      setTitle("");
      setDescription("");
      setDueDate("");
      await refresh();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="mt-4">
      <select
        aria-label="Class"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
      >
        {classes.map((klass) => (
          <option key={klass.id} value={klass.id}>
            {klass.name} {klass.section}
          </option>
        ))}
      </select>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

      {role === "teacher" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="text"
            aria-label="Subject"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="text"
            aria-label="Title"
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="text"
            aria-label="Description"
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="date"
            aria-label="Due date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded bg-blue-600 px-3 py-2 text-white"
          >
            New Assignment
          </button>
        </div>
      )}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Title</th>
            <th className="border-b border-gray-200 pb-2">Subject</th>
            <th className="border-b border-gray-200 pb-2">Due date</th>
            <th className="border-b border-gray-200 pb-2">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr
              key={assignment.id}
              onClick={() => setSelectedId(assignment.id)}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="border-b border-gray-100 py-2">{assignment.title}</td>
              <td className="border-b border-gray-100 py-2">{assignment.subject}</td>
              <td className="border-b border-gray-100 py-2">{assignment.dueDate}</td>
              <td
                className={`border-b border-gray-100 py-2 ${
                  assignment.hasOverdue
                    ? "text-red-600"
                    : assignment.submittedCount === assignment.totalCount
                      ? "text-green-600"
                      : "text-amber-600"
                }`}
              >
                {assignment.submittedCount}/{assignment.totalCount} submitted
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
