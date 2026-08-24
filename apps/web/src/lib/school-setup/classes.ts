import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface ClassSummary {
  id: number;
  gradeId: number;
  gradeName: string;
  section: string;
  academicYearId: number;
  archived: boolean;
  capacity: number | null;
  room: string | null;
}

export interface ClassListItem extends ClassSummary {
  enrolledCount: number;
}

function toSummary(klass: { id: number; gradeId: number; section: string; academicYearId: number; archived: boolean; capacity: number | null; room: string | null; grade: { name: string } }): ClassSummary {
  return {
    id: klass.id,
    gradeId: klass.gradeId,
    gradeName: klass.grade.name,
    section: klass.section,
    academicYearId: klass.academicYearId,
    archived: klass.archived,
    capacity: klass.capacity,
    room: klass.room,
  };
}

export async function listClasses(
  prisma: PrismaClient,
  schoolId: number,
  options?: { includeArchived?: boolean; academicYearId?: number }
): Promise<ClassListItem[]> {
  const classes = await prisma.class.findMany({
    where: {
      schoolId,
      ...(options?.includeArchived ? {} : { archived: false }),
      ...(options?.academicYearId ? { academicYearId: options.academicYearId } : {}),
    },
    include: { grade: true },
    orderBy: [{ grade: { sortOrder: "asc" } }, { section: "asc" }],
  });

  // Most enrollment write paths (createStudent/editStudent) validate that an
  // enrollment's classId and academicYearId agree with the target class's
  // own academicYearId. That invariant does NOT hold for retained students
  // in confirmPromotionRun (see promotion.ts): a retained student's
  // enrollment is deliberately created with classId = their current
  // (from-year) class but academicYearId = the promotion run's *target*
  // year, since the student stays in the same class while the school
  // rolls forward a year. So a class's active-enrollment count can't be
  // derived from classId alone — it must also match on academicYearId.
  // Prisma's `_count.where` can't reference the parent row's own field, so
  // instead we group counts by (classId, academicYearId) across all fetched
  // classes in one query and look up each class's count using its own year.
  const classIds = classes.map((klass) => klass.id);
  const grouped = classIds.length
    ? await prisma.enrollment.groupBy({
        by: ["classId", "academicYearId"],
        where: { classId: { in: classIds }, status: "active" },
        _count: true,
      })
    : [];
  const countsByClassAndYear = new Map(grouped.map((row) => [`${row.classId}:${row.academicYearId}`, row._count]));

  return classes.map((klass) => ({
    ...toSummary(klass),
    enrolledCount: countsByClassAndYear.get(`${klass.id}:${klass.academicYearId}`) ?? 0,
  }));
}

export type CreateClassResult = { ok: true; class: ClassSummary } | { ok: false; error: "DUPLICATE" } | { ok: false; error: "INVALID_GRADE" } | { ok: false; error: "INVALID_YEAR" };

export async function createClass(
  prisma: PrismaClient,
  schoolId: number,
  input: { gradeId: number; section: string; academicYearId: number; capacity?: number; room?: string }
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
      data: {
        schoolId,
        gradeId: input.gradeId,
        section: input.section,
        academicYearId: input.academicYearId,
        capacity: input.capacity ?? null,
        room: input.room ?? null,
      },
      include: { grade: true },
    });
    return { ok: true, class: toSummary(created) };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
}

export type EditClassResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE" }
  | { ok: false; error: "INVALID_GRADE" }
  | { ok: false; error: "INVALID_YEAR" }
  | { ok: false; error: "HAS_ACTIVE_ENROLLMENTS" };

export async function editClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; fields: { gradeId?: number; section?: string; academicYearId?: number; capacity?: number; room?: string } }
): Promise<EditClassResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.gradeId !== undefined) {
    const grade = await prisma.grade.findFirst({ where: { id: params.fields.gradeId, schoolId: params.schoolId } });
    if (!grade) return { ok: false, error: "INVALID_GRADE" };
  }
  if (params.fields.academicYearId !== undefined) {
    const year = await prisma.academicYear.findFirst({ where: { id: params.fields.academicYearId, schoolId: params.schoolId } });
    if (!year) return { ok: false, error: "INVALID_YEAR" };

    // Reassigning a class to a different academic year while it still has
    // active enrollments would leave those enrollment rows pointing at a
    // class whose academicYearId no longer matches the year the student was
    // actually enrolled in. listClasses's enrolledCount now matches
    // enrollments on (classId, academicYearId) rather than classId alone, so
    // it wouldn't misattribute those enrollments to the new year — but the
    // reassignment would still corrupt the per-class invariant that a
    // class's own academicYearId reflects the year its active enrollments
    // belong to, which other flows (e.g. promotion mapping) rely on. Block
    // the reassignment outright so that invariant holds.
    if (params.fields.academicYearId !== klass.academicYearId) {
      const activeEnrollmentCount = await prisma.enrollment.count({
        where: { classId: params.classId, status: "active" },
      });
      if (activeEnrollmentCount > 0) return { ok: false, error: "HAS_ACTIVE_ENROLLMENTS" };
    }
  }

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
      data: {
        gradeId: params.fields.gradeId,
        section: params.fields.section,
        academicYearId: params.fields.academicYearId,
        capacity: params.fields.capacity,
        room: params.fields.room,
      },
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
