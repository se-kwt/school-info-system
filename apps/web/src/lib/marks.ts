import type { PrismaClient } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";

export interface MarkCell {
  marksObtained: number;
  maxMarks: number;
  grade: string;
}

export interface MarksStudentRow {
  studentId: number;
  name: string;
  marks: Record<string, MarkCell | null>;
}

export type GetMarksResult =
  | { ok: true; subjects: string[]; students: MarksStudentRow[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_EXAM" };

export async function getMarksForClassExam(
  prisma: PrismaClient,
  params: {
    classId: number;
    examId: number;
    schoolId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<GetMarksResult> {
  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: { classId: params.classId, teacherUserId: params.userId },
    });
    if (!link) {
      return { ok: false, error: "NOT_ASSIGNED" };
    }
  } else {
    const klass = await prisma.class.findFirst({
      where: { id: params.classId, schoolId: params.schoolId },
    });
    if (!klass) {
      return { ok: false, error: "INVALID_CLASS" };
    }
  }

  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId },
  });
  if (!exam) {
    return { ok: false, error: "INVALID_EXAM" };
  }

  const students = await prisma.student.findMany({
    where: { classId: params.classId },
    orderBy: { name: "asc" },
  });

  const marks = await prisma.mark.findMany({
    where: { examId: params.examId, studentId: { in: students.map((s) => s.id) } },
  });

  const subjects = Array.from(new Set(marks.map((mark) => mark.subject))).sort();

  const studentRows: MarksStudentRow[] = students.map((student) => {
    const marksBySubject: Record<string, MarkCell | null> = {};
    for (const subject of subjects) {
      const mark = marks.find((m) => m.studentId === student.id && m.subject === subject);
      marksBySubject[subject] = mark
        ? { marksObtained: mark.marksObtained, maxMarks: mark.maxMarks, grade: mark.grade }
        : null;
    }
    return { studentId: student.id, name: student.name, marks: marksBySubject };
  });

  return { ok: true, subjects, students: studentRows };
}
