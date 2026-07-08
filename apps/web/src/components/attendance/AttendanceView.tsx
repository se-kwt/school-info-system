"use client";

import { useEffect, useState } from "react";

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

interface RosterEntry {
  studentId: number;
  name: string;
  status: "present" | "absent" | "late" | null;
  note: string | null;
  monthPercent: number;
}

const STATUS_BADGE: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-600",
  late: "bg-amber-50 text-amber-600",
  absent: "bg-red-50 text-red-500",
};

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none";
const smallInputClass =
  "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceView({
  classes,
  role,
}: {
  classes: ClassOption[];
  role: "teacher" | "admin";
}) {
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [date, setDate] = useState(todayDateString());
  const [students, setStudents] = useState<RosterEntry[]>([]);
  const [statusEdits, setStatusEdits] = useState<Record<number, "present" | "absent" | "late">>(
    {}
  );
  const [noteEdits, setNoteEdits] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) return;
    setError(null);
    setMessage(null);
    fetch(`/api/attendance?classId=${classId}&date=${date}`).then(async (response) => {
      if (!response.ok) {
        const body = await response.json();
        setError(body.error);
        setStudents([]);
        return;
      }
      const body = await response.json();
      setStudents(body.students);
      const statusMap: Record<number, "present" | "absent" | "late"> = {};
      const noteMap: Record<number, string> = {};
      for (const student of body.students as RosterEntry[]) {
        statusMap[student.studentId] = student.status ?? "present";
        noteMap[student.studentId] = student.note ?? "";
      }
      setStatusEdits(statusMap);
      setNoteEdits(noteMap);
    });
  }, [classId, date]);

  async function handleSave() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: Number(classId),
        date,
        entries: students.map((student) => ({
          studentId: student.studentId,
          status: statusEdits[student.studentId] ?? "present",
          note: noteEdits[student.studentId] || undefined,
        })),
      }),
    });

    if (response.ok) {
      setMessage("Attendance saved");
      const refreshed = await fetch(`/api/attendance?classId=${classId}&date=${date}`);
      if (refreshed.ok) {
        const body = await refreshed.json();
        setStudents(body.students);
      }
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Class"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          className={inputClass}
        >
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name} {klass.section}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Attendance date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={inputClass}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Status</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Note</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">This Month&apos;s %</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.studentId}>
                <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                  {student.name}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4">
                  {role === "teacher" ? (
                    <select
                      aria-label={`Status for ${student.name}`}
                      value={statusEdits[student.studentId] ?? "present"}
                      onChange={(event) =>
                        setStatusEdits((prev) => ({
                          ...prev,
                          [student.studentId]: event.target.value as "present" | "absent" | "late",
                        }))
                      }
                      className={smallInputClass}
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                    </select>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        student.status ? STATUS_BADGE[student.status] : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {student.status
                        ? student.status.charAt(0).toUpperCase() + student.status.slice(1)
                        : "—"}
                    </span>
                  )}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {role === "teacher" ? (
                    <input
                      type="text"
                      aria-label={`Note for ${student.name}`}
                      value={noteEdits[student.studentId] ?? ""}
                      onChange={(event) =>
                        setNoteEdits((prev) => ({
                          ...prev,
                          [student.studentId]: event.target.value,
                        }))
                      }
                      className={smallInputClass}
                      placeholder="Optional note"
                    />
                  ) : (
                    <span>{student.note ?? "—"}</span>
                  )}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.monthPercent}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {role === "teacher" && (
        <button
          type="button"
          onClick={handleSave}
          className="w-fit rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Save Attendance
        </button>
      )}
    </div>
  );
}
