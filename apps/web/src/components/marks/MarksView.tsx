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
  gradeName: string;
  section: string;
}

interface TeacherClassSubject {
  classId: number;
  subjectId: number;
  subjectName: string;
}

interface MarkCell {
  marksObtained: number;
  maxMarks: number;
  grade: string;
}

interface SubjectOption {
  id: number;
  name: string;
}

interface StudentRow {
  studentId: number;
  name: string;
  marks: Record<number, MarkCell | null>;
}

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

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
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [entrySubjectId, setEntrySubjectId] = useState("");
  const [marksEdits, setMarksEdits] = useState<Record<number, string>>({});
  const [newExamName, setNewExamName] = useState("");
  const [newExamTerm, setNewExamTerm] = useState("");
  const [newExamDate, setNewExamDate] = useState("");
  const [newExamMaxMarks, setNewExamMaxMarks] = useState("");
  const [newExamPassMarks, setNewExamPassMarks] = useState("");

  const availableSubjects = teacherSubjects
    .filter((ts) => ts.classId === Number(classId))
    .map((ts) => ({ id: ts.subjectId, name: ts.subjectName }));

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
    setEntrySubjectId(availableSubjects[0] ? String(availableSubjects[0].id) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  useEffect(() => {
    const map: Record<number, string> = {};
    for (const student of students) {
      const cell = student.marks[Number(entrySubjectId)];
      map[student.studentId] = cell ? String(cell.marksObtained) : "";
    }
    setMarksEdits(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySubjectId, students]);

  async function handleCreateExam() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newExamName,
        term: newExamTerm,
        examDate: newExamDate,
        maxMarks: Number(newExamMaxMarks),
        passMarks: Number(newExamPassMarks),
      }),
    });

    if (response.ok) {
      const created = await response.json();
      setMessage("Exam created");
      setNewExamName("");
      setNewExamTerm("");
      setNewExamDate("");
      setNewExamMaxMarks("");
      setNewExamPassMarks("");
      const listResponse = await fetch("/api/exams");
      if (listResponse.ok) {
        const body = await listResponse.json();
        setExams(body.exams);
      }
      setExamId(String(created.id));
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
        subjectId: Number(entrySubjectId),
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Exam"
          value={examId}
          onChange={(event) => setExamId(event.target.value)}
          className={inputClass}
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
          className={inputClass}
        >
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.gradeName} {klass.section}
            </option>
          ))}
        </select>

        {role === "admin" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200/60 p-2">
            <input
              type="text"
              aria-label="New exam name"
              placeholder="Exam name"
              value={newExamName}
              onChange={(event) => setNewExamName(event.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              aria-label="New exam term"
              placeholder="Term"
              value={newExamTerm}
              onChange={(event) => setNewExamTerm(event.target.value)}
              className={inputClass}
            />
            <input
              type="date"
              aria-label="New exam date"
              value={newExamDate}
              onChange={(event) => setNewExamDate(event.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              aria-label="New exam max marks"
              placeholder="Max Marks"
              value={newExamMaxMarks}
              onChange={(event) => setNewExamMaxMarks(event.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              aria-label="New exam pass marks"
              placeholder="Pass Marks"
              value={newExamPassMarks}
              onChange={(event) => setNewExamPassMarks(event.target.value)}
              className={inputClass}
            />
            <button
              type="button"
              onClick={handleCreateExam}
              className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-semibold text-white transition-all hover:bg-black"
            >
              New Exam
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
              {subjects.map((subject) => (
                <th key={subject.id} className="border-b border-neutral-100 pb-2 pr-4">
                  {subject.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.studentId}>
                <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                  {student.name}
                </td>
                {subjects.map((subject) => {
                  const cell = student.marks[subject.id];
                  return (
                    <td key={subject.id} className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                      {cell ? `${cell.marksObtained}/${cell.maxMarks} (${cell.grade})` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {role === "teacher" && availableSubjects.length > 0 && (
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
          <h2 className="mb-3 text-sm font-bold text-neutral-800">Enter Marks</h2>
          <div className="flex gap-2">
            <select
              aria-label="Entry subject"
              value={entrySubjectId}
              onChange={(event) => setEntrySubjectId(event.target.value)}
              className={inputClass}
            >
              {availableSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
          <table className="mt-4 w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
                <th className="border-b border-neutral-100 pb-2 pr-4">Marks Obtained</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.studentId}>
                  <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                    {student.name}
                  </td>
                  <td className="border-b border-neutral-50 py-2 pr-4">
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
                      className={inputClass}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={handleSave}
            className="mt-4 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Save Marks
          </button>
        </div>
      )}
    </div>
  );
}
