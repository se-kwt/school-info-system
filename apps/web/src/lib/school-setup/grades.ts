import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface GradeSummary {
  id: number;
  name: string;
  subjectCount: number;
  classCount: number;
}

export async function listGrades(prisma: PrismaClient, schoolId: number): Promise<GradeSummary[]> {
  const grades = await prisma.grade.findMany({
    where: { schoolId },
    include: { _count: { select: { subjects: true, classes: true } } },
    orderBy: { name: "asc" },
  });
  return grades.map((grade) => ({
    id: grade.id,
    name: grade.name,
    subjectCount: grade._count.subjects,
    classCount: grade._count.classes,
  }));
}

export type CreateGradeResult = { ok: true; grade: { id: number; name: string } } | { ok: false; error: "DUPLICATE" };

export async function createGrade(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string }
): Promise<CreateGradeResult> {
  const existing = await prisma.grade.findFirst({ where: { schoolId, name: input.name } });
  if (existing) return { ok: false, error: "DUPLICATE" };

  try {
    const created = await prisma.grade.create({
      data: { schoolId, name: input.name },
      select: { id: true, name: true },
    });
    return { ok: true, grade: created };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
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
