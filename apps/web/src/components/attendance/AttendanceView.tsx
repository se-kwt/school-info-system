"use client";

import { useEffect, useState } from "react";
import { StudentAttendanceCard } from "./StudentAttendanceCard";
import { AttendanceReviewPanel } from "./AttendanceReviewPanel";
import { cycleAttendanceStatus, type AttendanceStatusValue } from "@/lib/attendance-status";

interface ClassOption {
  id: number;
  gradeName: string;
  section: string;
}

interface RosterEntry {
  studentId: number;
  name: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: AttendanceStatusValue;
  note: string | null;
  monthPercent: number;
}

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none";

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
  const [statusMap, setStatusMap] = useState<Record<number, AttendanceStatusValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const isEditable = role === "admin" || (role === "teacher" && date === todayDateString());

  function applyRoster(roster: RosterEntry[]) {
    setStudents(roster);
    const nextStatusMap: Record<number, AttendanceStatusValue> = {};
    for (const student of roster) {
      nextStatusMap[student.studentId] = student.status;
    }
    setStatusMap(nextStatusMap);
  }

  useEffect(() => {
    if (!classId) return;
    setError(null);
    setMessage(null);
    setReviewOpen(false);
    fetch(`/api/attendance?classId=${classId}&date=${date}`).then(async (response) => {
      if (!response.ok) {
        const body = await response.json();
        setError(body.error);
        setStudents([]);
        setStatusMap({});
        return;
      }
      const body = await response.json();
      applyRoster(body.students as RosterEntry[]);
    });
  }, [classId, date]);

  function markAll(status: AttendanceStatusValue) {
    const nextStatusMap: Record<number, AttendanceStatusValue> = {};
    for (const student of students) {
      nextStatusMap[student.studentId] = status;
    }
    setStatusMap(nextStatusMap);
  }

  function cycleStudent(studentId: number) {
    setStatusMap((prev) => ({
      ...prev,
      [studentId]: cycleAttendanceStatus(prev[studentId] ?? null),
    }));
  }

  async function handleConfirmSubmit() {
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
          status: statusMap[student.studentId] ?? null,
        })),
      }),
    });

    if (response.ok) {
      setMessage("Attendance submitted");
      setReviewOpen(false);
      const refreshed = await fetch(`/api/attendance?classId=${classId}&date=${date}`);
      if (refreshed.ok) {
        const body = await refreshed.json();
        applyRoster(body.students as RosterEntry[]);
      }
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  const reviewEntries = students
    .filter((student) => (statusMap[student.studentId] ?? null) !== "present")
    .map((student) => ({
      studentId: student.studentId,
      name: student.name,
      rollNumber: student.rollNumber,
      photoUrl: student.photoUrl,
      status: statusMap[student.studentId] ?? null,
    }));

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
              {klass.gradeName} {klass.section}
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

      {isEditable && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => markAll("present")}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-700"
          >
            Mark All Present
          </button>
          <button
            type="button"
            onClick={() => markAll("absent")}
            className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-red-600"
          >
            Mark All Absent
          </button>
          <button
            type="button"
            onClick={() => markAll(null)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
          >
            Reset
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {students.map((student) => (
          <StudentAttendanceCard
            key={student.studentId}
            name={student.name}
            rollNumber={student.rollNumber}
            photoUrl={student.photoUrl}
            status={statusMap[student.studentId] ?? null}
            onClick={isEditable ? () => cycleStudent(student.studentId) : () => {}}
          />
        ))}
      </div>

      {isEditable && (
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="w-fit self-end rounded-full bg-neutral-900 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Submit All
        </button>
      )}

      {reviewOpen && (
        <AttendanceReviewPanel
          entries={reviewEntries}
          onCycle={cycleStudent}
          onBack={() => setReviewOpen(false)}
          onConfirm={handleConfirmSubmit}
        />
      )}
    </div>
  );
}
