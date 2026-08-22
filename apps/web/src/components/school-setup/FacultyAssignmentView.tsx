"use client";

import { useState } from "react";

interface FacultyAssignment {
  subjectId: number;
  subjectName: string;
  teacherUserId: number;
  teacherName: string;
  isClassTeacher: boolean;
}

interface SubjectOption {
  id: number;
  name: string;
}

interface TeacherOption {
  id: number;
  name: string;
  status: "active" | "inactive";
}

export function FacultyAssignmentView({
  classId,
  subjects,
  teachers,
  initialAssignments,
}: {
  classId: number;
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  initialAssignments: FacultyAssignment[];
}) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [subjectId, setSubjectId] = useState(subjects[0] ? String(subjects[0].id) : "");
  const [teacherUserId, setTeacherUserId] = useState(teachers[0] ? String(teachers[0].id) : "");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch(`/api/classes/${classId}/faculty`);
    setAssignments(await response.json());
  }

  async function handleAssign() {
    setError(null);
    const response = await fetch(`/api/classes/${classId}/faculty`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId: Number(subjectId), teacherUserId: Number(teacherUserId) }),
    });
    if (response.status === 201) {
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  async function handleUnassign(subjectId: number, teacherUserId: number) {
    setError(null);
    const response = await fetch(`/api/classes/${classId}/faculty/${subjectId}/${teacherUserId}`, { method: "DELETE" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  async function handleSetClassTeacher(teacherUserId: number) {
    setError(null);
    const response = await fetch(`/api/classes/${classId}/class-teacher`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teacherUserId }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  const assignedTeacherIds = [...new Set(assignments.map((a) => a.teacherUserId))];

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Subject"
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Teacher"
          value={teacherUserId}
          onChange={(event) => setTeacherUserId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleAssign} className="rounded bg-blue-600 px-3 py-2 text-white">
          Assign
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Subject</th>
            <th className="border-b border-gray-200 pb-2">Teacher</th>
            <th className="border-b border-gray-200 pb-2">Class Teacher</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr key={`${assignment.subjectId}-${assignment.teacherUserId}`}>
              <td className="border-b border-gray-100 py-2">{assignment.subjectName}</td>
              <td className="border-b border-gray-100 py-2">{assignment.teacherName}</td>
              <td className="border-b border-gray-100 py-2">
                {assignment.isClassTeacher ? (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Class Teacher
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetClassTeacher(assignment.teacherUserId)}
                    className="text-xs text-blue-600 underline"
                  >
                    Make class teacher
                  </button>
                )}
              </td>
              <td className="border-b border-gray-100 py-2">
                <button
                  type="button"
                  onClick={() => handleUnassign(assignment.subjectId, assignment.teacherUserId)}
                  className="text-red-600 underline"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {assignedTeacherIds.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">
          No faculty assigned yet. Assign a subject teacher above before picking a class teacher.
        </p>
      )}
    </div>
  );
}
