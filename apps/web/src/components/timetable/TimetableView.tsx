"use client";

import { useEffect, useState } from "react";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

interface ClassOption {
  id: number;
  gradeId: number;
  gradeName: string;
  section: string;
}

interface SubjectOption {
  id: number;
  name: string;
  gradeId: number;
}

interface FacultyAssignment {
  subjectId: number;
  teacherUserId: number;
  teacherName: string;
}

interface PeriodOption {
  id: number;
  order: number;
  label: string;
  isBreak: boolean;
}

interface TimetableEntry {
  id: number;
  dayOfWeek: number;
  periodId: number;
  periodOrder: number;
  periodLabel: string;
  subjectId: number;
  subjectName: string;
  teacherUserId: number | null;
  teacherName: string | null;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS = [1, 2, 3, 4, 5, 6];

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

export function TimetableView({
  classes,
  subjects,
  periods,
  role,
}: {
  classes: ClassOption[];
  subjects: SubjectOption[];
  periods: PeriodOption[];
  role: "teacher" | "admin";
}) {
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const selectedClass = classes.find((c) => String(c.id) === classId) ?? null;
  const availableSubjects = selectedClass
    ? subjects.filter((s) => s.gradeId === selectedClass.gradeId)
    : [];
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [faculty, setFaculty] = useState<FacultyAssignment[]>([]);
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [activeDay, setActiveDay] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState<Record<number, string>>({});
  const [newPeriodId, setNewPeriodId] = useState<Record<number, string>>({});
  const [newTeacher, setNewTeacher] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editTeacher, setEditTeacher] = useState("");
  const { isSubmitting, run } = useSubmitGuard();

  async function refresh() {
    if (!classId) return;
    const [entriesResponse, facultyResponse] = await Promise.all([
      fetch(`/api/timetable?classId=${classId}`),
      role === "admin" ? fetch(`/api/classes/${classId}/faculty`) : Promise.resolve(null),
    ]);
    if (!entriesResponse.ok) {
      const body = await entriesResponse.json();
      setError(body.error);
      setEntries([]);
      return;
    }
    const body = await entriesResponse.json();
    setEntries(body.entries);
    if (facultyResponse?.ok) {
      setFaculty(await facultyResponse.json());
    }
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  function teachersForSubject(subjectId: number): FacultyAssignment[] {
    const seen = new Set<number>();
    return faculty.filter((f) => {
      if (f.subjectId !== subjectId || seen.has(f.teacherUserId)) return false;
      seen.add(f.teacherUserId);
      return true;
    });
  }

  async function handleAdd(day: number) {
    setError(null);
    setMessage(null);
    const subjectId = Number(newSubject[day]);
    const periodId = Number(newPeriodId[day]);
    const teacherUserId = newTeacher[day] ? Number(newTeacher[day]) : undefined;

    await run(async () => {
      const response = await fetch("/api/timetable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId: Number(classId), dayOfWeek: day, periodId, subjectId, teacherUserId }),
      });

      if (response.ok) {
        setMessage("Period added");
        setNewSubject((prev) => ({ ...prev, [day]: "" }));
        setNewPeriodId((prev) => ({ ...prev, [day]: "" }));
        setNewTeacher((prev) => ({ ...prev, [day]: "" }));
        await refresh();
        return;
      }
      const body = await response.json();
      setError(body.error);
    });
  }

  function startEdit(entry: TimetableEntry) {
    setEditingId(entry.id);
    setEditSubject(String(entry.subjectId));
    setEditTeacher(entry.teacherUserId ? String(entry.teacherUserId) : "");
  }

  async function handleEditSave(entryId: number) {
    setError(null);
    setMessage(null);
    await run(async () => {
      const response = await fetch(`/api/timetable/${entryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: Number(editSubject),
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
    });
  }

  async function handleDelete(entryId: number) {
    setError(null);
    setMessage(null);
    await run(async () => {
      const response = await fetch(`/api/timetable/${entryId}`, { method: "DELETE" });

      if (response.ok) {
        setMessage("Period deleted");
        await refresh();
        return;
      }
      const body = await response.json();
      setError(body.error);
    });
  }

  function renderDayColumn(day: number) {
    const dayEntries = entries.filter((entry) => entry.dayOfWeek === day).sort((a, b) => a.periodOrder - b.periodOrder);
    return (
      <div
        key={day}
        className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-800">{DAY_NAMES[day]}</h2>
          {viewMode === "week" && (
            <button type="button" onClick={() => { setActiveDay(day); setViewMode("day"); }} className="text-[10px] text-indigo-600 underline">
              Focus
            </button>
          )}
        </div>
        <ul className="mt-2 space-y-2 text-xs">
          {periods.map((period) => {
            const entry = dayEntries.find((e) => e.periodId === period.id);
            if (period.isBreak) {
              return (
                <li key={period.id} className="rounded bg-neutral-50 px-2 py-1 text-center text-neutral-400">
                  {period.label}
                </li>
              );
            }
            if (!entry) {
              return role === "admin" ? (
                <li key={period.id} className="border-b border-neutral-50 pb-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-neutral-400">{period.label}</span>
                    <select
                      aria-label={`Subject for ${period.label} on ${DAY_NAMES[day]}`}
                      value={newSubject[day] ?? ""}
                      onChange={(event) => {
                        setNewSubject((prev) => ({ ...prev, [day]: event.target.value }));
                        setNewPeriodId((prev) => ({ ...prev, [day]: String(period.id) }));
                      }}
                      className={inputClass}
                    >
                      <option value="">Select subject</option>
                      {availableSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                    {newSubject[day] && newPeriodId[day] === String(period.id) && (
                      <>
                        <select
                          aria-label={`Teacher for ${period.label} on ${DAY_NAMES[day]}`}
                          value={newTeacher[day] ?? ""}
                          onChange={(event) => setNewTeacher((prev) => ({ ...prev, [day]: event.target.value }))}
                          className={inputClass}
                        >
                          <option value="">No teacher</option>
                          {teachersForSubject(Number(newSubject[day])).map((f) => (
                            <option key={f.teacherUserId} value={f.teacherUserId}>
                              {f.teacherName}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAdd(day)}
                          disabled={isSubmitting}
                          className="rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ) : null;
            }
            return (
              <li key={period.id} className="border-b border-neutral-50 pb-2">
                {editingId === entry.id ? (
                  <div className="flex flex-col gap-1">
                    <select
                      aria-label={`Edit subject for ${period.label}`}
                      value={editSubject}
                      onChange={(event) => setEditSubject(event.target.value)}
                      className={inputClass}
                    >
                      {availableSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Edit teacher for ${period.label}`}
                      value={editTeacher}
                      onChange={(event) => setEditTeacher(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">No teacher</option>
                      {teachersForSubject(Number(editSubject)).map((f) => (
                        <option key={f.teacherUserId} value={f.teacherUserId}>
                          {f.teacherName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleEditSave(entry.id)}
                      disabled={isSubmitting}
                      className="rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium text-neutral-700">
                      {period.label}: {entry.subjectName}
                    </div>
                    <div className="text-neutral-400">{entry.teacherName ?? "—"}</div>
                    {role === "admin" && (
                      <div className="mt-1 flex gap-2">
                        <button type="button" onClick={() => startEdit(entry)} className="text-[10px] font-semibold text-indigo-600 hover:underline">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          disabled={isSubmitting}
                          className="text-[10px] font-semibold text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Class"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          className="w-fit rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none"
        >
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.gradeName} {klass.section}
            </option>
          ))}
        </select>

        <div className="flex rounded-lg border border-neutral-200 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`px-3 py-2 font-semibold ${viewMode === "week" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setViewMode("day")}
            className={`px-3 py-2 font-semibold ${viewMode === "day" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
          >
            Day
          </button>
        </div>

        {viewMode === "day" && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveDay((prev) => (prev === 1 ? 6 : prev - 1))}
              className="rounded border border-neutral-200 px-2 py-1"
            >
              ← Prev
            </button>
            <span className="font-semibold text-neutral-700">{DAY_NAMES[activeDay]}</span>
            <button
              type="button"
              onClick={() => setActiveDay((prev) => (prev === 6 ? 1 : prev + 1))}
              className="rounded border border-neutral-200 px-2 py-1"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}

      {viewMode === "week" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">{DAYS.map((day) => renderDayColumn(day))}</div>
      ) : (
        <div className="max-w-md">{renderDayColumn(activeDay)}</div>
      )}
    </div>
  );
}
