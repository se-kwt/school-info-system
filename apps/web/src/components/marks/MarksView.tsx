"use client";

import { useEffect, useState } from "react";

interface ExamOption {
  id: number;
  name: string;
  term: string;
  examDate: string;
}

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

interface TeacherClassSubject {
  classId: number;
  subject: string;
}

interface MarkCell {
  marksObtained: number;
  maxMarks: number;
  grade: string;
}

interface StudentRow {
  studentId: number;
  name: string;
  marks: Record<string, MarkCell | null>;
}

export function MarksView({
  exams: initialExams,
  classes,
  teacherSubjects,
  role,
}: {
  exams: ExamOption[];
  classes: ClassOption[];
  teacherSubjects: TeacherClassSubject[];
  role: "teacher" | "admin";
}) {
  const [exams, setExams] = useState(initialExams);
  const [examId, setExamId] = useState(exams[0] ? String(exams[0].id) : "");
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [entrySubject, setEntrySubject] = useState("");
  const [maxMarks, setMaxMarks] = useState("");
  const [marksEdits, setMarksEdits] = useState<Record<number, string>>({});
  const [newExamName, setNewExamName] = useState("");
  const [newExamTerm, setNewExamTerm] = useState("");
  const [newExamDate, setNewExamDate] = useState("");

  const availableSubjects = teacherSubjects
    .filter((ts) => ts.classId === Number(classId))
    .map((ts) => ts.subject);

  async function refresh() {
    if (!classId || !examId) return;
    const response = await fetch(`/api/marks?classId=${classId}&examId=${examId}`);
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      setSubjects([]);
      setStudents([]);
      return;
    }
    const body = await response.json();
    setSubjects(body.subjects);
    setStudents(body.students);
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, examId]);

  useEffect(() => {
    setEntrySubject(availableSubjects[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  useEffect(() => {
    const map: Record<number, string> = {};
    for (const student of students) {
      const cell = student.marks[entrySubject];
      map[student.studentId] = cell ? String(cell.marksObtained) : "";
    }
    setMarksEdits(map);
    const anyCell = students.map((s) => s.marks[entrySubject]).find((c) => c);
    setMaxMarks(anyCell ? String(anyCell.maxMarks) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySubject, students]);

  async function handleCreateExam() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newExamName, term: newExamTerm, examDate: newExamDate }),
    });

    if (response.ok) {
      setMessage("Exam created");
      setNewExamName("");
      setNewExamTerm("");
      setNewExamDate("");
      const listResponse = await fetch("/api/exams");
      if (listResponse.ok) {
        const body = await listResponse.json();
        setExams(body.exams);
      }
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  async function handleSave() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/marks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: Number(classId),
        examId: Number(examId),
        subject: entrySubject,
        maxMarks: Number(maxMarks),
        entries: students.map((student) => ({
          studentId: student.studentId,
          marksObtained: Number(marksEdits[student.studentId] ?? 0),
        })),
      }),
    });

    if (response.ok) {
      setMessage("Marks saved");
      await refresh();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Exam"
          value={examId}
          onChange={(event) => setExamId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name} ({exam.term})
            </option>
          ))}
        </select>
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

        {role === "admin" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="New exam name"
              placeholder="Exam name"
              value={newExamName}
              onChange={(event) => setNewExamName(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <input
              type="text"
              aria-label="New exam term"
              placeholder="Term"
              value={newExamTerm}
              onChange={(event) => setNewExamTerm(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <input
              type="date"
              aria-label="New exam date"
              value={newExamDate}
              onChange={(event) => setNewExamDate(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <button
              type="button"
              onClick={handleCreateExam}
              className="rounded bg-blue-600 px-3 py-1 text-white"
            >
              New Exam
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            {subjects.map((subject) => (
              <th key={subject} className="border-b border-gray-200 pb-2">
                {subject}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.studentId}>
              <td className="border-b border-gray-100 py-2">{student.name}</td>
              {subjects.map((subject) => {
                const cell = student.marks[subject];
                return (
                  <td key={subject} className="border-b border-gray-100 py-2">
                    {cell ? `${cell.marksObtained}/${cell.maxMarks} (${cell.grade})` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {role === "teacher" && availableSubjects.length > 0 && (
        <div className="mt-6 border-t border-gray-200 pt-4">
          <h2 className="text-lg font-medium text-gray-800">Enter Marks</h2>
          <div className="mt-2 flex gap-2">
            <select
              aria-label="Entry subject"
              value={entrySubject}
              onChange={(event) => setEntrySubject(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              {availableSubjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
            <input
              type="number"
              aria-label="Max Marks"
              placeholder="Max Marks"
              value={maxMarks}
              onChange={(event) => setMaxMarks(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
          </div>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 pb-2">Name</th>
                <th className="border-b border-gray-200 pb-2">Marks Obtained</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.studentId}>
                  <td className="border-b border-gray-100 py-2">{student.name}</td>
                  <td className="border-b border-gray-100 py-2">
                    <input
                      type="number"
                      aria-label={`Marks for ${student.name}`}
                      value={marksEdits[student.studentId] ?? ""}
                      onChange={(event) =>
                        setMarksEdits((prev) => ({
                          ...prev,
                          [student.studentId]: event.target.value,
                        }))
                      }
                      className="rounded border border-gray-300 px-2 py-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={handleSave}
            className="mt-4 rounded bg-blue-600 px-3 py-2 text-white"
          >
            Save Marks
          </button>
        </div>
      )}
    </div>
  );
}
