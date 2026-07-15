import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface ClassSummary {
  id: number;
  gradeId: number;
  gradeName: string;
  section: string;
  academicYearId: number;
  archived: boolean;
}

function toSummary(klass: { id: number; gradeId: number; section: string; academicYearId: number; archived: boolean; grade: { name: string } }): ClassSummary {
  return {
    id: klass.id,
    gradeId: klass.gradeId,
    gradeName: klass.grade.name,
    section: klass.section,
    academicYearId: klass.academicYearId,
    archived: klass.archived,
  };
}

export async function listClasses(
  prisma: PrismaClient,
  schoolId: number,
  options?: { includeArchived?: boolean; academicYearId?: number }
): Promise<ClassSummary[]> {
  const classes = await prisma.class.findMany({
    where: {
      schoolId,
      ...(options?.includeArchived ? {} : { archived: false }),
      ...(options?.academicYearId ? { academicYearId: options.academicYearId } : {}),
    },
    include: { grade: true },
    orderBy: [{ grade: { name: "asc" } }, { section: "asc" }],
  });
  return classes.map(toSummary);
}

export type CreateClassResult = { ok: true; class: ClassSummary } | { ok: false; error: "DUPLICATE" } | { ok: false; error: "INVALID_GRADE" } | { ok: false; error: "INVALID_YEAR" };

export async function createClass(
  prisma: PrismaClient,
  schoolId: number,
  input: { gradeId: number; section: string; academicYearId: number }
): Promise<CreateClassResult> {
  const [grade, year] = await Promise.all([
    prisma.grade.findFirst({ where: { id: input.gradeId, schoolId } }),
    prisma.academicYear.findFirst({ where: { id: input.academicYearId, schoolId } }),
  ]);
  if (!grade) return { ok: false, error: "INVALID_GRADE" };
  if (!year) return { ok: false, error: "INVALID_YEAR" };

  const existing = await prisma.class.findFirst({
    where: { gradeId: input.gradeId, section: input.section, academicYearId: input.academicYearId },
  });
  if (existing) return { ok: false, error: "DUPLICATE" };

  try {
    const created = await prisma.class.create({
      data: { schoolId, gradeId: input.gradeId, section: input.section, academicYearId: input.academicYearId },
      include: { grade: true },
    });
    return { ok: true, class: toSummary(created) };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
}

export type EditClassResult = { ok: true } | { ok: false; error: "NOT_FOUND" } | { ok: false; error: "DUPLICATE" };

export async function editClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; fields: { gradeId?: number; section?: string; academicYearId?: number } }
): Promise<EditClassResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  const nextGradeId = params.fields.gradeId ?? klass.gradeId;
  const nextSection = params.fields.section ?? klass.section;
  const nextYearId = params.fields.academicYearId ?? klass.academicYearId;
  const duplicate = await prisma.class.findFirst({
    where: { gradeId: nextGradeId, section: nextSection, academicYearId: nextYearId, id: { not: params.classId } },
  });
  if (duplicate) return { ok: false, error: "DUPLICATE" };

  try {
    await prisma.class.update({
      where: { id: params.classId },
      data: { gradeId: params.fields.gradeId, section: params.fields.section, academicYearId: params.fields.academicYearId },
    });
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
}

export type DeleteClassResult = { ok: true; deleted: true } | { ok: false; error: "NOT_FOUND" } | { ok: false; error: "HAS_HISTORY" };

export async function deleteClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number }
): Promise<DeleteClassResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  const [enrollmentCount, classTeacherCount, timetableCount, assignmentCount, feeStructureCount, mappingCount] =
    await Promise.all([
      prisma.enrollment.count({ where: { classId: params.classId } }),
      prisma.classTeacher.count({ where: { classId: params.classId } }),
      prisma.timetableEntry.count({ where: { classId: params.classId } }),
      prisma.assignment.count({ where: { classId: params.classId } }),
      prisma.feeStructure.count({ where: { classId: params.classId } }),
      prisma.promotionMapping.count({ where: { OR: [{ fromClassId: params.classId }, { toClassId: params.classId }] } }),
    ]);

  const hasHistory =
    enrollmentCount + classTeacherCount + timetableCount + assignmentCount + feeStructureCount + mappingCount > 0;
  if (hasHistory) return { ok: false, error: "HAS_HISTORY" };

  await prisma.class.delete({ where: { id: params.classId } });
  return { ok: true, deleted: true };
}

export type ArchiveClassResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function archiveClass(prisma: PrismaClient, params: { classId: number; schoolId: number }): Promise<ArchiveClassResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "NOT_FOUND" };
  await prisma.class.update({ where: { id: params.classId }, data: { archived: true } });
  return { ok: true };
}

export type UnarchiveClassResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function unarchiveClass(prisma: PrismaClient, params: { classId: number; schoolId: number }): Promise<UnarchiveClassResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "NOT_FOUND" };
  await prisma.class.update({ where: { id: params.classId }, data: { archived: false } });
  return { ok: true };
}
