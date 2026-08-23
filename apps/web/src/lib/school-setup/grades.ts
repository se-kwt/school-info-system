import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation, uniqueConstraintTarget } from "./prisma-errors";

export interface GradeSummary {
  id: number;
  name: string;
  subjectCount: number;
  classCount: number;
  subjectNames: string[];
}

export async function listGrades(
  prisma: PrismaClient,
  schoolId: number,
  options?: { academicYearId?: number }
): Promise<GradeSummary[]> {
  const grades = await prisma.grade.findMany({
    where: { schoolId },
    include: {
      _count: {
        select: {
          subjects: true,
          classes: options?.academicYearId ? { where: { academicYearId: options.academicYearId } } : true,
        },
      },
      subjects: { select: { name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });
  return grades.map((grade) => ({
    id: grade.id,
    name: grade.name,
    subjectCount: grade._count.subjects,
    classCount: grade._count.classes,
    subjectNames: grade.subjects.map((subject) => subject.name),
  }));
}

export type CreateGradeResult =
  | { ok: true; grade: { id: number; name: string } }
  | { ok: false; error: "DUPLICATE" }
  | { ok: false; error: "DUPLICATE_SORT_ORDER" };

// The sortOrder auto-assignment below reads the current max and writes max+1.
// Without isolation, two concurrent calls for the same school (both omitting
// sortOrder) can read the same max before either inserts, then both attempt
// the same max+1 — the unique constraint stops silent corruption but one call
// would get a spurious DUPLICATE_SORT_ORDER instead of a clean create. Wrap
// the read-then-write in a Serializable transaction (same pattern as
// `recordPayment` in fee-payments.ts) so Postgres aborts the losing
// transaction with a serialization failure (P2034) instead of letting both
// compute the same value; the caller (the /api/grades POST route) retries
// once on P2034, exactly like `recordPaymentWithRetry` does.
//
// NOTE: as with recordPayment, early returns below still COMMIT the
// transaction (Prisma only rolls back on a thrown error). Both early returns
// here sit BEFORE the single create at the end of the body, so committing an
// empty transaction is harmless. Any future write added above an early
// return breaks that and must be reordered or made to throw.
export async function createGrade(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string; sortOrder?: number }
): Promise<CreateGradeResult> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.grade.findFirst({ where: { schoolId, name: input.name } });
      if (existing) return { ok: false, error: "DUPLICATE" };

      let sortOrder = input.sortOrder;
      if (sortOrder === undefined) {
        const highest = await tx.grade.findFirst({ where: { schoolId }, orderBy: { sortOrder: "desc" } });
        sortOrder = (highest?.sortOrder ?? 0) + 1;
      }

      try {
        const created = await tx.grade.create({
          data: { schoolId, name: input.name, sortOrder },
          select: { id: true, name: true },
        });
        return { ok: true, grade: created };
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          const target = uniqueConstraintTarget(err);
          if (target?.includes("sortOrder")) return { ok: false, error: "DUPLICATE_SORT_ORDER" };
          return { ok: false, error: "DUPLICATE" };
        }
        throw err;
      }
    },
    { isolationLevel: "Serializable" }
  );
}

export type EditGradeResult = { ok: true } | { ok: false; error: "NOT_FOUND" } | { ok: false; error: "DUPLICATE" };

export async function editGrade(
  prisma: PrismaClient,
  params: { gradeId: number; schoolId: number; name: string }
): Promise<EditGradeResult> {
  const grade = await prisma.grade.findFirst({ where: { id: params.gradeId, schoolId: params.schoolId } });
  if (!grade) return { ok: false, error: "NOT_FOUND" };

  const duplicate = await prisma.grade.findFirst({
    where: { schoolId: params.schoolId, name: params.name, id: { not: params.gradeId } },
  });
  if (duplicate) return { ok: false, error: "DUPLICATE" };

  try {
    await prisma.grade.update({ where: { id: params.gradeId }, data: { name: params.name } });
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
}

export type DeleteGradeResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteGrade(
  prisma: PrismaClient,
  params: { gradeId: number; schoolId: number }
): Promise<DeleteGradeResult> {
  const grade = await prisma.grade.findFirst({ where: { id: params.gradeId, schoolId: params.schoolId } });
  if (!grade) return { ok: false, error: "NOT_FOUND" };

  const [classCount, subjectCount] = await Promise.all([
    prisma.class.count({ where: { gradeId: params.gradeId } }),
    prisma.subject.count({ where: { gradeId: params.gradeId } }),
  ]);
  if (classCount + subjectCount > 0) return { ok: false, error: "HAS_HISTORY" };

  await prisma.grade.delete({ where: { id: params.gradeId } });
  return { ok: true, deleted: true };
}
