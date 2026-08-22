import type { AcademicYear, PrismaClient } from "@prisma/client";

export async function getActiveAcademicYear(
  prisma: PrismaClient,
  schoolId: number
): Promise<AcademicYear | null> {
  return prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });
}

export type ResolveAcademicYearResult =
  | { ok: true; academicYear: AcademicYear }
  | { ok: false; error: "INVALID_ACADEMIC_YEAR" };

export async function resolveAcademicYear(
  prisma: PrismaClient,
  schoolId: number,
  requestedId?: number
): Promise<ResolveAcademicYearResult> {
  const academicYear = requestedId
    ? await prisma.academicYear.findFirst({ where: { id: requestedId, schoolId } })
    : await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });

  if (!academicYear) {
    return { ok: false, error: "INVALID_ACADEMIC_YEAR" };
  }
  return { ok: true, academicYear };
}

export interface AcademicYearSummary {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "archived";
}

export async function listAcademicYears(
  prisma: PrismaClient,
  schoolId: number
): Promise<AcademicYearSummary[]> {
  const years = await prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: "desc" },
  });
  return years.map((year) => ({
    id: year.id,
    name: year.name,
    startDate: year.startDate.toISOString().slice(0, 10),
    endDate: year.endDate.toISOString().slice(0, 10),
    status: year.status,
  }));
}

export type CreateAcademicYearResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_DATE_RANGE" }
  | { ok: false; error: "DUPLICATE_NAME" };

export async function createAcademicYear(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string; startDate: string; endDate: string }
): Promise<CreateAcademicYearResult> {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (startDate >= endDate) {
    return { ok: false, error: "INVALID_DATE_RANGE" };
  }

  const existing = await prisma.academicYear.findFirst({
    where: { schoolId, name: input.name },
  });
  if (existing) {
    return { ok: false, error: "DUPLICATE_NAME" };
  }

  const created = await prisma.academicYear.create({
    data: { schoolId, name: input.name, startDate, endDate, status: "upcoming" },
  });
  return { ok: true, id: created.id };
}

export type ActivateAcademicYearResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "ALREADY_ARCHIVED" };

export async function activateAcademicYear(
  prisma: PrismaClient,
  params: { academicYearId: number; schoolId: number }
): Promise<ActivateAcademicYearResult> {
  const target = await prisma.academicYear.findFirst({
    where: { id: params.academicYearId, schoolId: params.schoolId },
  });
  if (!target) return { ok: false, error: "NOT_FOUND" };
  if (target.status === "archived") return { ok: false, error: "ALREADY_ARCHIVED" };
  if (target.status === "active") return { ok: true };

  await prisma.$transaction([
    prisma.academicYear.updateMany({
      where: { schoolId: params.schoolId, status: "active" },
      data: { status: "archived" },
    }),
    prisma.academicYear.update({
      where: { id: params.academicYearId },
      data: { status: "active" },
    }),
  ]);

  return { ok: true };
}

export type ArchiveAcademicYearResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "LAST_ACTIVE_YEAR" };

export async function archiveAcademicYear(
  prisma: PrismaClient,
  params: { academicYearId: number; schoolId: number }
): Promise<ArchiveAcademicYearResult> {
  const target = await prisma.academicYear.findFirst({
    where: { id: params.academicYearId, schoolId: params.schoolId },
  });
  if (!target) return { ok: false, error: "NOT_FOUND" };
  if (target.status === "archived") return { ok: true };

  if (target.status === "active") {
    return { ok: false, error: "LAST_ACTIVE_YEAR" };
  }

  await prisma.academicYear.update({
    where: { id: params.academicYearId },
    data: { status: "archived" },
  });

  return { ok: true };
}
