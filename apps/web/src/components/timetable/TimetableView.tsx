"use client";

import { useEffect, useState } from "react";

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

interface TeacherOption {
  id: number;
  name: string;
}

interface TimetableEntry {
  id: number;
  dayOfWeek: number;
  period: number;
  subject: string;
  teacherUserId: number | null;
  teacherName: string | null;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS = [1, 2, 3, 4, 5, 6];

export function TimetableView({
  classes,
  teachers,
  role,
}: {
  classes: ClassOption[];
  teachers: TeacherOption[];
  role: "teacher" | "admin";
}) {
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState<Record<number, string>>({});
  const [newSubject, setNewSubject] = useState<Record<number, string>>({});
  const [newTeacher, setNewTeacher] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editTeacher, setEditTeacher] = useState("");

  async function refresh() {
    if (!classId) return;
    const response = await fetch(`/api/timetable?classId=${classId}`);
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      setEntries([]);
      return;
    }
    const body = await response.json();
    setEntries(body.entries);
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function handleAdd(day: number) {
    setError(null);
    setMessage(null);
    const period = Number(newPeriod[day]);
    const subject = newSubject[day] ?? "";
    const teacherUserId = newTeacher[day] ? Number(newTeacher[day]) : undefined;

    const response = await fetch("/api/timetable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: Number(classId),
        dayOfWeek: day,
        period,
        subject,
        teacherUserId,
      }),
    });

    if (response.ok) {
      setMessage("Period added");
      setNewPeriod((prev) => ({ ...prev, [day]: "" }));
      setNewSubject((prev) => ({ ...prev, [day]: "" }));
      setNewTeacher((prev) => ({ ...prev, [day]: "" }));
      await refresh();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  function startEdit(entry: TimetableEntry) {
    setEditingId(entry.id);
    setEditSubject(entry.subject);
    setEditTeacher(entry.teacherUserId ? String(entry.teacherUserId) : "");
  }

  async function handleEditSave(entryId: number) {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/timetable/${entryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: editSubject,
        teacherUserId: editTeacher ? Number(editTeacher) : null,
      }),
    });

    if (response.ok) {
      setMessage("Period updated");
      setEditingId(null);
      await refresh();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  async function handleDelete(entryId: number) {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/timetable/${entryId}`, { method: "DELETE" });

    if (response.ok) {
      setMessage("Period deleted");
      await refresh();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

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

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {DAYS.map((day) => (
          <div key={day} className="rounded border border-gray-200 p-3">
            <h2 className="font-medium text-gray-800">{DAY_NAMES[day]}</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {entries
                .filter((entry) => entry.dayOfWeek === day)
                .map((entry) => (
                  <li key={entry.id} className="border-b border-gray-100 pb-2">
                    {editingId === entry.id ? (
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          aria-label={`Edit subject for period ${entry.period}`}
                          value={editSubject}
                          onChange={(event) => setEditSubject(event.target.value)}
                          className="rounded border border-gray-300 px-2 py-1"
                        />
                        <select
                          aria-label={`Edit teacher for period ${entry.period}`}
                          value={editTeacher}
                          onChange={(event) => setEditTeacher(event.target.value)}
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          <option value="">No teacher</option>
                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {teacher.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleEditSave(entry.id)}
                          className="rounded bg-blue-600 px-2 py-1 text-white"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div>
                          Period {entry.period}: {entry.subject}
                        </div>
                        <div className="text-gray-500">{entry.teacherName ?? "—"}</div>
                        {role === "admin" && (
                          <div className="mt-1 flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(entry)}
                              className="text-xs text-blue-600"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry.id)}
                              className="text-xs text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
            </ul>

            {role === "admin" && (
              <div className="mt-3 flex flex-col gap-1">
                <input
                  type="number"
                  aria-label={`New period number for ${DAY_NAMES[day]}`}
                  placeholder="Period #"
                  value={newPeriod[day] ?? ""}
                  onChange={(event) =>
                    setNewPeriod((prev) => ({ ...prev, [day]: event.target.value }))
                  }
                  className="rounded border border-gray-300 px-2 py-1"
                />
                <input
                  type="text"
                  aria-label={`New subject for ${DAY_NAMES[day]}`}
                  placeholder="Subject"
                  value={newSubject[day] ?? ""}
                  onChange={(event) =>
                    setNewSubject((prev) => ({ ...prev, [day]: event.target.value }))
                  }
                  className="rounded border border-gray-300 px-2 py-1"
                />
                <select
                  aria-label={`New teacher for ${DAY_NAMES[day]}`}
                  value={newTeacher[day] ?? ""}
                  onChange={(event) =>
                    setNewTeacher((prev) => ({ ...prev, [day]: event.target.value }))
                  }
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">No teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleAdd(day)}
                  className="rounded bg-blue-600 px-2 py-1 text-white"
                >
                  Add Period
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
