import type { PrismaClient } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { getEnrolledStudents } from "./enrollment";

export interface MarkCell {
  marksObtained: number;
  maxMarks: number;
  grade: string;
  isAbsent: boolean;
  remarks: string | null;
}

export interface SubjectOption {
  id: number;
  name: string;
}

export interface MarksStudentRow {
  studentId: number;
  name: string;
  marks: Record<number, MarkCell | null>;
}

export type GetMarksResult =
  | { ok: true; subjects: SubjectOption[]; students: MarksStudentRow[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_EXAM" };

export async function getMarksForClassExam(
  prisma: PrismaClient,
  params: { classId: number; examId: number; schoolId: number; academicYearId: number; role: SessionClaims["role"]; userId: number }
): Promise<GetMarksResult> {
  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: { classId: params.classId, teacherUserId: params.userId, academicYearId: params.academicYearId },
    });
    if (!link) return { ok: false, error: "NOT_ASSIGNED" };
  } else {
    const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
    if (!klass) return { ok: false, error: "INVALID_CLASS" };
  }

  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId, academicYearId: params.academicYearId },
  });
  if (!exam) return { ok: false, error: "INVALID_EXAM" };

  const enrolled = await getEnrolledStudents(prisma, { classId: params.classId, academicYearId: params.academicYearId });
  const marks = await prisma.mark.findMany({
    where: { examId: params.examId, studentId: { in: enrolled.map((s) => s.id) } },
    include: { subject: true },
  });

  const subjectMap = new Map<number, string>();
  for (const mark of marks) subjectMap.set(mark.subjectId, mark.subject.name);
  const subjects = [...subjectMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  const students = enrolled.map((student) => {
    const marksBySubject: Record<number, MarkCell | null> = {};
    for (const subject of subjects) {
      const mark = marks.find((m) => m.studentId === student.id && m.subjectId === subject.id);
      marksBySubject[subject.id] = mark
        ? { marksObtained: mark.marksObtained, maxMarks: mark.maxMarks, grade: mark.grade, isAbsent: mark.isAbsent, remarks: mark.remarks }
        : null;
    }
    return { studentId: student.id, name: student.name, marks: marksBySubject };
  });

  return { ok: true, subjects, students };
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
    subjectId: number;
    teacherUserId: number;
    schoolId: number;
    academicYearId: number;
    entries: { studentId: number; marksObtained: number; isAbsent?: boolean; remarks?: string }[];
  }
): Promise<EnterMarksResult> {
  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId, academicYearId: params.academicYearId },
  });
  if (!exam) return { ok: false, error: "INVALID_EXAM" };

  const link = await prisma.classTeacher.findFirst({
    where: { classId: params.classId, subjectId: params.subjectId, teacherUserId: params.teacherUserId, academicYearId: params.academicYearId },
  });
  if (!link) return { ok: false, error: "NOT_ASSIGNED" };

  const enrolled = await getEnrolledStudents(prisma, { classId: params.classId, academicYearId: params.academicYearId });
  const enrolledIds = new Set(enrolled.map((s) => s.id));
  const allEnrolled = params.entries.every((e) => enrolledIds.has(e.studentId));
  if (!allEnrolled) return { ok: false, error: "STUDENT_MISMATCH" };

  const allValid = params.entries.every(
    (e) => e.isAbsent || (e.marksObtained >= 0 && e.marksObtained <= exam.maxMarks)
  );
  if (!allValid) return { ok: false, error: "INVALID_MARKS_RANGE" };

  await prisma.$transaction(
    params.entries.map((entry) =>
      prisma.mark.upsert({
        where: { examId_studentId_subjectId: { examId: params.examId, studentId: entry.studentId, subjectId: params.subjectId } },
        create: {
          examId: params.examId,
          studentId: entry.studentId,
          subjectId: params.subjectId,
          academicYearId: params.academicYearId,
          marksObtained: entry.isAbsent ? 0 : entry.marksObtained,
          maxMarks: exam.maxMarks,
          grade: entry.isAbsent ? "AB" : computeGrade(entry.marksObtained, exam.maxMarks),
          isAbsent: entry.isAbsent ?? false,
          remarks: entry.remarks ?? null,
          enteredById: params.teacherUserId,
          enteredAt: new Date(),
        },
        update: {
          marksObtained: entry.isAbsent ? 0 : entry.marksObtained,
          maxMarks: exam.maxMarks,
          grade: entry.isAbsent ? "AB" : computeGrade(entry.marksObtained, exam.maxMarks),
          isAbsent: entry.isAbsent ?? false,
          remarks: entry.remarks ?? null,
          enteredById: params.teacherUserId,
          enteredAt: new Date(),
        },
      })
    )
  );

  return { ok: true };
}
