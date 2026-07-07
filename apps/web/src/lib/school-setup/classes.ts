import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface ClassSummary {
  id: number;
  name: string;
  section: string;
  archived: boolean;
}

export async function listClasses(
  prisma: PrismaClient,
  schoolId: number,
  options?: { includeArchived?: boolean }
): Promise<ClassSummary[]> {
  return prisma.class.findMany({
    where: options?.includeArchived ? { schoolId } : { schoolId, archived: false },
    select: { id: true, name: true, section: true, archived: true },
    orderBy: [{ name: "asc" }, { section: "asc" }],
  });
}

export type CreateClassResult = { ok: true; class: ClassSummary } | { ok: false; error: "DUPLICATE" };

export async function createClass(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string; section: string }
): Promise<CreateClassResult> {
  const existing = await prisma.class.findFirst({
    where: { schoolId, name: input.name, section: input.section },
  });
  if (existing) return { ok: false, error: "DUPLICATE" };

  try {
    const created = await prisma.class.create({
      data: { schoolId, name: input.name, section: input.section },
      select: { id: true, name: true, section: true, archived: true },
    });
    return { ok: true, class: created };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
}

export type EditClassResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE" };

export async function editClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; fields: { name?: string; section?: string } }
): Promise<EditClassResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  const nextName = params.fields.name ?? klass.name;
  const nextSection = params.fields.section ?? klass.section;
  const duplicate = await prisma.class.findFirst({
    where: {
      schoolId: params.schoolId,
      name: nextName,
      section: nextSection,
      id: { not: params.classId },
    },
  });
  if (duplicate) return { ok: false, error: "DUPLICATE" };

  try {
    await prisma.class.update({
      where: { id: params.classId },
      data: { name: params.fields.name, section: params.fields.section },
    });
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
}

export type DeleteClassResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number }
): Promise<DeleteClassResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  const [enrollmentCount, classTeacherCount, timetableCount, assignmentCount, feeStructureCount, mappingCount] =
    await Promise.all([
      prisma.enrollment.count({ where: { classId: params.classId } }),
      prisma.classTeacher.count({ where: { classId: params.classId } }),
      prisma.timetableEntry.count({ where: { classId: params.classId } }),
      prisma.assignment.count({ where: { classId: params.classId } }),
      prisma.feeStructure.count({ where: { classId: params.classId } }),
      prisma.promotionMapping.count({
        where: { OR: [{ fromClassId: params.classId }, { toClassId: params.classId }] },
      }),
    ]);

  const hasHistory =
    enrollmentCount + classTeacherCount + timetableCount + assignmentCount + feeStructureCount + mappingCount > 0;
  if (hasHistory) return { ok: false, error: "HAS_HISTORY" };

  await prisma.class.delete({ where: { id: params.classId } });
  return { ok: true, deleted: true };
}

export type ArchiveClassResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function archiveClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number }
): Promise<ArchiveClassResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  await prisma.class.update({ where: { id: params.classId }, data: { archived: true } });
  return { ok: true };
}
