import type { PrismaClient } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { isUniqueConstraintViolation, uniqueConstraintTarget } from "./school-setup/prisma-errors";

export interface TimetableEntrySummary {
  id: number;
  dayOfWeek: number;
  periodId: number;
  periodOrder: number;
  periodLabel: string;
  subjectId: number;
  subjectName: string;
  teacherUserId: number | null;
  teacherName: string | null;
}

export type ListTimetableResult =
  | { ok: true; entries: TimetableEntrySummary[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function listTimetableEntries(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; academicYearId: number; role: SessionClaims["role"]; userId: number }
): Promise<ListTimetableResult> {
  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: { classId: params.classId, teacherUserId: params.userId, academicYearId: params.academicYearId },
    });
    if (!link) return { ok: false, error: "NOT_ASSIGNED" };
  } else {
    const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
    if (!klass) return { ok: false, error: "INVALID_CLASS" };
  }

  const entries = await prisma.timetableEntry.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId },
    include: { teacher: true, subject: true, period: true },
    orderBy: [{ dayOfWeek: "asc" }, { period: { order: "asc" } }],
  });

  return {
    ok: true,
    entries: entries.map((entry) => ({
      id: entry.id,
      dayOfWeek: entry.dayOfWeek,
      periodId: entry.periodId,
      periodOrder: entry.period.order,
      periodLabel: entry.period.label,
      subjectId: entry.subjectId,
      subjectName: entry.subject.name,
      teacherUserId: entry.teacherUserId,
      teacherName: entry.teacher ? entry.teacher.name : null,
    })),
  };
}

export type CreateTimetableEntryResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_DAY" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "INVALID_TEACHER" }
  | { ok: false; error: "TEACHER_ALREADY_BOOKED" }
  | { ok: false; error: "DUPLICATE_SLOT" };

export async function createTimetableEntry(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    academicYearId: number;
    classId: number;
    dayOfWeek: number;
    periodId: number;
    subjectId: number;
    teacherUserId?: number;
  }
): Promise<CreateTimetableEntryResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "INVALID_CLASS" };
  if (params.dayOfWeek < 1 || params.dayOfWeek > 6) return { ok: false, error: "INVALID_DAY" };

  const subject = await prisma.subject.findFirst({ where: { id: params.subjectId, gradeId: klass.gradeId } });
  if (!subject) return { ok: false, error: "INVALID_SUBJECT" };

  if (params.teacherUserId !== undefined) {
    const link = await prisma.classTeacher.findFirst({
      where: { classId: params.classId, subjectId: params.subjectId, teacherUserId: params.teacherUserId, academicYearId: params.academicYearId },
    });
    if (!link) return { ok: false, error: "INVALID_TEACHER" };
  }

  if (params.teacherUserId !== undefined) {
    const clash = await prisma.timetableEntry.findFirst({
      where: {
        teacherUserId: params.teacherUserId,
        dayOfWeek: params.dayOfWeek,
        periodId: params.periodId,
        academicYearId: params.academicYearId,
      },
    });
    if (clash) return { ok: false, error: "TEACHER_ALREADY_BOOKED" };
  }

  try {
    const created = await prisma.timetableEntry.create({
      data: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        dayOfWeek: params.dayOfWeek,
        periodId: params.periodId,
        subjectId: params.subjectId,
        teacherUserId: params.teacherUserId ?? null,
      },
    });
    return { ok: true, id: created.id };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      const target = uniqueConstraintTarget(err);
      if (target?.includes("teacherUserId")) return { ok: false, error: "TEACHER_ALREADY_BOOKED" };
      return { ok: false, error: "DUPLICATE_SLOT" };
    }
    throw err;
  }
}

export type EditTimetableEntryResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "INVALID_TEACHER" }
  | { ok: false; error: "TEACHER_ALREADY_BOOKED" };

export async function editTimetableEntry(
  prisma: PrismaClient,
  params: { entryId: number; schoolId: number; fields: { subjectId?: number; teacherUserId?: number | null } }
): Promise<EditTimetableEntryResult> {
  const entry = await prisma.timetableEntry.findUnique({ where: { id: params.entryId }, include: { class: true } });
  if (!entry || entry.class.schoolId !== params.schoolId) return { ok: false, error: "NOT_FOUND" };

  const data: { subjectId?: number; teacherUserId?: number | null } = {};
  if (params.fields.subjectId !== undefined) {
    const subject = await prisma.subject.findFirst({
      where: { id: params.fields.subjectId, gradeId: entry.class.gradeId },
    });
    if (!subject) return { ok: false, error: "INVALID_SUBJECT" };
    data.subjectId = params.fields.subjectId;
  }
  if (params.fields.teacherUserId !== undefined) {
    if (params.fields.teacherUserId !== null) {
      const link = await prisma.classTeacher.findFirst({
        where: {
          classId: entry.classId,
          subjectId: params.fields.subjectId ?? entry.subjectId,
          teacherUserId: params.fields.teacherUserId,
          academicYearId: entry.academicYearId,
        },
      });
      if (!link) return { ok: false, error: "INVALID_TEACHER" };

      const clash = await prisma.timetableEntry.findFirst({
        where: {
          teacherUserId: params.fields.teacherUserId,
          dayOfWeek: entry.dayOfWeek,
          periodId: entry.periodId,
          academicYearId: entry.academicYearId,
          id: { not: params.entryId },
        },
      });
      if (clash) return { ok: false, error: "TEACHER_ALREADY_BOOKED" };
    }
    data.teacherUserId = params.fields.teacherUserId;
  }

  try {
    await prisma.timetableEntry.update({ where: { id: params.entryId }, data });
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      const target = uniqueConstraintTarget(err);
      if (target?.includes("teacherUserId")) return { ok: false, error: "TEACHER_ALREADY_BOOKED" };
    }
    throw err;
  }
}

export type DeleteTimetableEntryResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function deleteTimetableEntry(
  prisma: PrismaClient,
  params: { entryId: number; schoolId: number }
): Promise<DeleteTimetableEntryResult> {
  const entry = await prisma.timetableEntry.findUnique({ where: { id: params.entryId }, include: { class: true } });
  if (!entry || entry.class.schoolId !== params.schoolId) return { ok: false, error: "NOT_FOUND" };

  await prisma.timetableEntry.delete({ where: { id: params.entryId } });
  return { ok: true };
}
