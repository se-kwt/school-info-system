import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface SubjectSummary {
  id: number;
  name: string;
  gradeId: number;
  versionCount: number;
}

export type ListSubjectsResult = { ok: true; subjects: SubjectSummary[] } | { ok: false; error: "INVALID_GRADE" };

export async function listSubjects(
  prisma: PrismaClient,
  params: { gradeId: number; schoolId: number }
): Promise<ListSubjectsResult> {
  const grade = await prisma.grade.findFirst({ where: { id: params.gradeId, schoolId: params.schoolId } });
  if (!grade) return { ok: false, error: "INVALID_GRADE" };

  const subjects = await prisma.subject.findMany({
    where: { gradeId: params.gradeId },
    orderBy: { name: "asc" },
    include: { _count: { select: { versions: true } } },
  });
  return {
    ok: true,
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, gradeId: s.gradeId, versionCount: s._count.versions })),
  };
}

export type CreateSubjectResult =
  | { ok: true; subject: SubjectSummary }
  | { ok: false; error: "INVALID_GRADE" }
  | { ok: false; error: "DUPLICATE" };

export async function createSubject(
  prisma: PrismaClient,
  params: { gradeId: number; schoolId: number; name: string }
): Promise<CreateSubjectResult> {
  const grade = await prisma.grade.findFirst({ where: { id: params.gradeId, schoolId: params.schoolId } });
  if (!grade) return { ok: false, error: "INVALID_GRADE" };

  const existing = await prisma.subject.findFirst({ where: { gradeId: params.gradeId, name: params.name } });
  if (existing) return { ok: false, error: "DUPLICATE" };

  try {
    const created = await prisma.subject.create({
      data: { gradeId: params.gradeId, name: params.name },
    });
    return { ok: true, subject: { id: created.id, name: created.name, gradeId: created.gradeId, versionCount: 0 } };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
}

export type DeleteSubjectResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteSubject(
  prisma: PrismaClient,
  params: { subjectId: number; schoolId: number }
): Promise<DeleteSubjectResult> {
  const subject = await prisma.subject.findFirst({
    where: { id: params.subjectId, grade: { schoolId: params.schoolId } },
  });
  if (!subject) return { ok: false, error: "NOT_FOUND" };

  const [versionCount, classTeacherCount, timetableCount, assignmentCount, markCount] = await Promise.all([
    prisma.syllabusVersion.count({ where: { subjectId: params.subjectId } }),
    prisma.classTeacher.count({ where: { subjectId: params.subjectId } }),
    prisma.timetableEntry.count({ where: { subjectId: params.subjectId } }),
    prisma.assignment.count({ where: { subjectId: params.subjectId } }),
    prisma.mark.count({ where: { subjectId: params.subjectId } }),
  ]);
  if (versionCount + classTeacherCount + timetableCount + assignmentCount + markCount > 0) {
    return { ok: false, error: "HAS_HISTORY" };
  }

  await prisma.subject.delete({ where: { id: params.subjectId } });
  return { ok: true, deleted: true };
}

export interface SyllabusVersionSummary {
  id: number;
  versionNum: number;
  title: string;
  content: string;
  fileUrl: string | null;
  fileName: string | null;
  createdByName: string;
  createdAt: string;
}

export type ListSyllabusVersionsResult =
  | { ok: true; versions: SyllabusVersionSummary[] }
  | { ok: false; error: "NOT_FOUND" };

export async function listSyllabusVersions(
  prisma: PrismaClient,
  params: { subjectId: number; schoolId: number }
): Promise<ListSyllabusVersionsResult> {
  const subject = await prisma.subject.findFirst({
    where: { id: params.subjectId, grade: { schoolId: params.schoolId } },
  });
  if (!subject) return { ok: false, error: "NOT_FOUND" };

  const versions = await prisma.syllabusVersion.findMany({
    where: { subjectId: params.subjectId },
    include: { createdBy: true },
    orderBy: { versionNum: "desc" },
  });

  return {
    ok: true,
    versions: versions.map((v) => ({
      id: v.id,
      versionNum: v.versionNum,
      title: v.title,
      content: v.content,
      fileUrl: v.fileUrl,
      fileName: v.fileName,
      createdByName: v.createdBy.name,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}

export interface SubjectWithGrade {
  id: number;
  name: string;
  gradeId: number;
}

export async function listAllSubjects(prisma: PrismaClient, schoolId: number): Promise<SubjectWithGrade[]> {
  const subjects = await prisma.subject.findMany({
    where: { grade: { schoolId } },
    orderBy: [{ grade: { name: "asc" } }, { name: "asc" }],
  });
  return subjects.map((s) => ({ id: s.id, name: s.name, gradeId: s.gradeId }));
}

export type CreateSyllabusVersionResult = { ok: true; id: number } | { ok: false; error: "NOT_FOUND" };

export async function createSyllabusVersion(
  prisma: PrismaClient,
  params: {
    subjectId: number;
    schoolId: number;
    title: string;
    content: string;
    fileUrl?: string;
    fileName?: string;
    createdById: number;
  }
): Promise<CreateSyllabusVersionResult> {
  const subject = await prisma.subject.findFirst({
    where: { id: params.subjectId, grade: { schoolId: params.schoolId } },
  });
  if (!subject) return { ok: false, error: "NOT_FOUND" };

  const latest = await prisma.syllabusVersion.findFirst({
    where: { subjectId: params.subjectId },
    orderBy: { versionNum: "desc" },
  });
  const nextVersionNum = (latest?.versionNum ?? 0) + 1;

  const created = await prisma.syllabusVersion.create({
    data: {
      subjectId: params.subjectId,
      versionNum: nextVersionNum,
      title: params.title,
      content: params.content,
      fileUrl: params.fileUrl ?? null,
      fileName: params.fileName ?? null,
      createdById: params.createdById,
    },
  });

  return { ok: true, id: created.id };
}
