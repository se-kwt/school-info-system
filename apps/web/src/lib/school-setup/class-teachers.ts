import type { PrismaClient } from "@prisma/client";

export interface FacultyAssignment {
  subjectId: number;
  subjectName: string;
  teacherUserId: number;
  teacherName: string;
  isClassTeacher: boolean;
}

export type ListClassFacultyResult = { ok: true; assignments: FacultyAssignment[] } | { ok: false; error: "NOT_FOUND" };

export async function listClassFaculty(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number }
): Promise<ListClassFacultyResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  const links = await prisma.classTeacher.findMany({
    where: { classId: params.classId },
    include: { subject: true, teacher: true },
    orderBy: [{ subject: { name: "asc" } }, { teacher: { name: "asc" } }],
  });

  return {
    ok: true,
    assignments: links.map((link) => ({
      subjectId: link.subjectId,
      subjectName: link.subject.name,
      teacherUserId: link.teacherUserId,
      teacherName: link.teacher.name,
      isClassTeacher: link.isClassTeacher,
    })),
  };
}

export type AssignResult =
  | { ok: true }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "CLASS_ARCHIVED" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "INVALID_TEACHER" }
  | { ok: false; error: "TEACHER_INACTIVE" }
  | { ok: false; error: "ALREADY_ASSIGNED" };

export async function assignTeacherToSubject(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; subjectId: number; teacherUserId: number }
): Promise<AssignResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "INVALID_CLASS" };
  if (klass.archived) return { ok: false, error: "CLASS_ARCHIVED" };

  const subject = await prisma.subject.findFirst({ where: { id: params.subjectId, gradeId: klass.gradeId } });
  if (!subject) return { ok: false, error: "INVALID_SUBJECT" };

  const teacher = await prisma.user.findFirst({ where: { id: params.teacherUserId, schoolId: params.schoolId, role: "teacher" } });
  if (!teacher) return { ok: false, error: "INVALID_TEACHER" };
  if (teacher.status !== "active") return { ok: false, error: "TEACHER_INACTIVE" };

  const existing = await prisma.classTeacher.findFirst({
    where: { classId: params.classId, subjectId: params.subjectId, teacherUserId: params.teacherUserId, academicYearId: klass.academicYearId },
  });
  if (existing) return { ok: false, error: "ALREADY_ASSIGNED" };

  await prisma.classTeacher.create({
    data: {
      classId: params.classId,
      subjectId: params.subjectId,
      teacherUserId: params.teacherUserId,
      academicYearId: klass.academicYearId,
    },
  });
  return { ok: true };
}

export type UnassignResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function unassignTeacherFromSubject(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; subjectId: number; teacherUserId: number }
): Promise<UnassignResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  const link = await prisma.classTeacher.findFirst({
    where: { classId: params.classId, subjectId: params.subjectId, teacherUserId: params.teacherUserId },
  });
  if (!link) return { ok: false, error: "NOT_FOUND" };

  await prisma.classTeacher.delete({ where: { id: link.id } });
  return { ok: true };
}

export type SetClassTeacherResult = { ok: true } | { ok: false; error: "INVALID_CLASS" } | { ok: false; error: "NOT_ASSIGNED" };

export async function setClassTeacher(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; teacherUserId: number }
): Promise<SetClassTeacherResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "INVALID_CLASS" };

  const links = await prisma.classTeacher.findMany({ where: { classId: params.classId, teacherUserId: params.teacherUserId } });
  if (links.length === 0) return { ok: false, error: "NOT_ASSIGNED" };

  await prisma.$transaction([
    prisma.classTeacher.updateMany({ where: { classId: params.classId }, data: { isClassTeacher: false } }),
    prisma.classTeacher.updateMany({
      where: { classId: params.classId, teacherUserId: params.teacherUserId },
      data: { isClassTeacher: true },
    }),
  ]);

  return { ok: true };
}
