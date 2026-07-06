import type { PrismaClient } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { isUniqueConstraintViolation } from "./school-setup/prisma-errors";

export interface TimetableEntrySummary {
  id: number;
  dayOfWeek: number;
  period: number;
  subject: string;
  teacherUserId: number | null;
  teacherName: string | null;
}

export type ListTimetableResult =
  | { ok: true; entries: TimetableEntrySummary[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function listTimetableEntries(
  prisma: PrismaClient,
  params: {
    classId: number;
    schoolId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<ListTimetableResult> {
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

  const entries = await prisma.timetableEntry.findMany({
    where: { classId: params.classId },
    include: { teacher: true },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  return {
    ok: true,
    entries: entries.map((entry) => ({
      id: entry.id,
      dayOfWeek: entry.dayOfWeek,
      period: entry.period,
      subject: entry.subject,
      teacherUserId: entry.teacherUserId,
      teacherName: entry.teacher ? entry.teacher.name : null,
    })),
  };
}

export type CreateTimetableEntryResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_DAY" }
  | { ok: false; error: "INVALID_TEACHER" }
  | { ok: false; error: "DUPLICATE_SLOT" };

export async function createTimetableEntry(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    classId: number;
    dayOfWeek: number;
    period: number;
    subject: string;
    teacherUserId?: number;
  }
): Promise<CreateTimetableEntryResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) {
    return { ok: false, error: "INVALID_CLASS" };
  }

  if (params.dayOfWeek < 1 || params.dayOfWeek > 6) {
    return { ok: false, error: "INVALID_DAY" };
  }

  if (params.teacherUserId !== undefined) {
    const teacher = await prisma.user.findFirst({
      where: { id: params.teacherUserId, schoolId: params.schoolId, role: "teacher" },
    });
    if (!teacher) {
      return { ok: false, error: "INVALID_TEACHER" };
    }
  }

  try {
    const created = await prisma.timetableEntry.create({
      data: {
        classId: params.classId,
        dayOfWeek: params.dayOfWeek,
        period: params.period,
        subject: params.subject,
        teacherUserId: params.teacherUserId ?? null,
      },
    });
    return { ok: true, id: created.id };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_SLOT" };
    }
    throw err;
  }
}

export type EditTimetableEntryResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_TEACHER" };

export async function editTimetableEntry(
  prisma: PrismaClient,
  params: {
    entryId: number;
    schoolId: number;
    fields: {
      subject?: string;
      teacherUserId?: number | null;
    };
  }
): Promise<EditTimetableEntryResult> {
  const entry = await prisma.timetableEntry.findUnique({
    where: { id: params.entryId },
    include: { class: true },
  });
  if (!entry || entry.class.schoolId !== params.schoolId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const data: { subject?: string; teacherUserId?: number | null } = {};
  if (params.fields.subject !== undefined) {
    data.subject = params.fields.subject;
  }
  if (params.fields.teacherUserId !== undefined) {
    if (params.fields.teacherUserId !== null) {
      const teacher = await prisma.user.findFirst({
        where: { id: params.fields.teacherUserId, schoolId: params.schoolId, role: "teacher" },
      });
      if (!teacher) {
        return { ok: false, error: "INVALID_TEACHER" };
      }
    }
    data.teacherUserId = params.fields.teacherUserId;
  }

  await prisma.timetableEntry.update({ where: { id: params.entryId }, data });
  return { ok: true };
}

export type DeleteTimetableEntryResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function deleteTimetableEntry(
  prisma: PrismaClient,
  params: { entryId: number; schoolId: number }
): Promise<DeleteTimetableEntryResult> {
  const entry = await prisma.timetableEntry.findUnique({
    where: { id: params.entryId },
    include: { class: true },
  });
  if (!entry || entry.class.schoolId !== params.schoolId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  await prisma.timetableEntry.delete({ where: { id: params.entryId } });
  return { ok: true };
}
