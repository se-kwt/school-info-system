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
    <div className="mt-4">
      <div className="flex gap-2">
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
        <input
          type="date"
          aria-label="Attendance date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Note</th>
            <th className="border-b border-gray-200 pb-2">This Month&apos;s %</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.studentId}>
              <td className="border-b border-gray-100 py-2">{student.name}</td>
              <td className="border-b border-gray-100 py-2">
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
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                  </select>
                ) : (
                  <span>
                    {student.status
                      ? student.status.charAt(0).toUpperCase() + student.status.slice(1)
                      : "—"}
                  </span>
                )}
              </td>
              <td className="border-b border-gray-100 py-2">
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
                    className="rounded border border-gray-300 px-2 py-1"
                    placeholder="Optional note"
                  />
                ) : (
                  <span>{student.note ?? "—"}</span>
                )}
              </td>
              <td className="border-b border-gray-100 py-2">{student.monthPercent}%</td>
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
          Save Attendance
        </button>
      )}
    </div>
  );
}
