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

export function computeGrade(marksObtained: number, maxMarks: number): string {
  const percentage = (marksObtained / maxMarks) * 100;
  if (percentage >= 90) return "A";
  if (percentage >= 75) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

export type EnterMarksResult =
  | { ok: true }
  | { ok: false; error: "INVALID_EXAM" }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "STUDENT_MISMATCH" }
  | { ok: false; error: "INVALID_MAX_MARKS" }
  | { ok: false; error: "INVALID_MARKS_RANGE" };

export async function enterMarks(
  prisma: PrismaClient,
  params: {
    classId: number;
    examId: number;
    subject: string;
    maxMarks: number;
    teacherUserId: number;
    schoolId: number;
    entries: Array<{ studentId: number; marksObtained: number }>;
  }
): Promise<EnterMarksResult> {
  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId },
  });
  if (!exam) {
    return { ok: false, error: "INVALID_EXAM" };
  }

  const link = await prisma.classTeacher.findFirst({
    where: {
      classId: params.classId,
      subject: params.subject,
      teacherUserId: params.teacherUserId,
    },
  });
  if (!link) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const studentCount = await prisma.student.count({
    where: {
      classId: params.classId,
      id: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (studentCount !== params.entries.length) {
    return { ok: false, error: "STUDENT_MISMATCH" };
  }

  if (params.maxMarks <= 0) {
    return { ok: false, error: "INVALID_MAX_MARKS" };
  }

  for (const entry of params.entries) {
    if (entry.marksObtained < 0 || entry.marksObtained > params.maxMarks) {
      return { ok: false, error: "INVALID_MARKS_RANGE" };
    }
  }

  await prisma.$transaction(
    params.entries.map((entry) =>
      prisma.mark.upsert({
        where: {
          examId_studentId_subject: {
            examId: params.examId,
            studentId: entry.studentId,
            subject: params.subject,
          },
        },
        create: {
          examId: params.examId,
          studentId: entry.studentId,
          subject: params.subject,
          marksObtained: entry.marksObtained,
          maxMarks: params.maxMarks,
          grade: computeGrade(entry.marksObtained, params.maxMarks),
        },
        update: {
          marksObtained: entry.marksObtained,
          maxMarks: params.maxMarks,
          grade: computeGrade(entry.marksObtained, params.maxMarks),
        },
      })
    )
  );

  return { ok: true };
}
