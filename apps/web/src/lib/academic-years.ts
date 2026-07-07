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
