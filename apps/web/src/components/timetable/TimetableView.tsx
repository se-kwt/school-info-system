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

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {DAYS.map((day) => (
          <div
            key={day}
            className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]"
          >
            <h2 className="text-sm font-bold text-neutral-800">{DAY_NAMES[day]}</h2>
            <ul className="mt-2 space-y-2 text-xs">
              {entries
                .filter((entry) => entry.dayOfWeek === day)
                .map((entry) => (
                  <li key={entry.id} className="border-b border-neutral-50 pb-2">
                    {editingId === entry.id ? (
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          aria-label={`Edit subject for period ${entry.period}`}
                          value={editSubject}
                          onChange={(event) => setEditSubject(event.target.value)}
                          className={inputClass}
                        />
                        <select
                          aria-label={`Edit teacher for period ${entry.period}`}
                          value={editTeacher}
                          onChange={(event) => setEditTeacher(event.target.value)}
                          className={inputClass}
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
                          className="rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white transition-all hover:bg-black"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium text-neutral-700">
                          Period {entry.period}: {entry.subject}
                        </div>
                        <div className="text-neutral-400">{entry.teacherName ?? "—"}</div>
                        {role === "admin" && (
                          <div className="mt-1 flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(entry)}
                              className="text-[10px] font-semibold text-indigo-600 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry.id)}
                              className="text-[10px] font-semibold text-red-500 hover:underline"
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
                  className={inputClass}
                />
                <input
                  type="text"
                  aria-label={`New subject for ${DAY_NAMES[day]}`}
                  placeholder="Subject"
                  value={newSubject[day] ?? ""}
                  onChange={(event) =>
                    setNewSubject((prev) => ({ ...prev, [day]: event.target.value }))
                  }
                  className={inputClass}
                />
                <select
                  aria-label={`New teacher for ${DAY_NAMES[day]}`}
                  value={newTeacher[day] ?? ""}
                  onChange={(event) =>
                    setNewTeacher((prev) => ({ ...prev, [day]: event.target.value }))
                  }
                  className={inputClass}
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
                  className="rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white transition-all hover:bg-black"
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
