import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "./school-setup/prisma-errors";

export interface PeriodWithTimes {
  id: number;
  order: number;
  label: string;
  isBreak: boolean;
  startTime: string;
  endTime: string;
  overridesByDay: Record<number, { startTime: string; endTime: string }>;
}

export async function listPeriods(prisma: PrismaClient, schoolId: number): Promise<PeriodWithTimes[]> {
  const periods = await prisma.period.findMany({
    where: { schoolId },
    include: { overrides: true },
    orderBy: { order: "asc" },
  });
  return periods.map((period) => ({
    id: period.id,
    order: period.order,
    label: period.label,
    isBreak: period.isBreak,
    startTime: period.startTime,
    endTime: period.endTime,
    overridesByDay: Object.fromEntries(
      period.overrides.map((o) => [o.dayOfWeek, { startTime: o.startTime, endTime: o.endTime }])
    ),
  }));
}

export type CreatePeriodResult =
  | { ok: true; period: { id: number } }
  | { ok: false; error: "DUPLICATE_ORDER" };

export async function createPeriod(
  prisma: PrismaClient,
  schoolId: number,
  input: { order: number; label: string; isBreak?: boolean; startTime: string; endTime: string }
): Promise<CreatePeriodResult> {
  try {
    const created = await prisma.period.create({
      data: {
        schoolId,
        order: input.order,
        label: input.label,
        isBreak: input.isBreak ?? false,
        startTime: input.startTime,
        endTime: input.endTime,
      },
    });
    return { ok: true, period: { id: created.id } };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE_ORDER" };
    throw err;
  }
}

export type DeletePeriodResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deletePeriod(
  prisma: PrismaClient,
  params: { periodId: number; schoolId: number }
): Promise<DeletePeriodResult> {
  const period = await prisma.period.findFirst({ where: { id: params.periodId, schoolId: params.schoolId } });
  if (!period) return { ok: false, error: "NOT_FOUND" };

  const entryCount = await prisma.timetableEntry.count({ where: { periodId: params.periodId } });
  if (entryCount > 0) return { ok: false, error: "HAS_HISTORY" };

  await prisma.period.delete({ where: { id: params.periodId } });
  return { ok: true, deleted: true };
}

export type SetOverrideResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_DAY" };

export async function setPeriodDayOverride(
  prisma: PrismaClient,
  params: { periodId: number; schoolId: number; dayOfWeek: number; startTime: string; endTime: string }
): Promise<SetOverrideResult> {
  if (params.dayOfWeek < 0 || params.dayOfWeek > 6) return { ok: false, error: "INVALID_DAY" };

  const period = await prisma.period.findFirst({ where: { id: params.periodId, schoolId: params.schoolId } });
  if (!period) return { ok: false, error: "NOT_FOUND" };

  await prisma.periodDayOverride.upsert({
    where: { periodId_dayOfWeek: { periodId: params.periodId, dayOfWeek: params.dayOfWeek } },
    create: { periodId: params.periodId, dayOfWeek: params.dayOfWeek, startTime: params.startTime, endTime: params.endTime },
    update: { startTime: params.startTime, endTime: params.endTime },
  });

  return { ok: true };
}

export type ClearOverrideResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function clearPeriodDayOverride(
  prisma: PrismaClient,
  params: { periodId: number; schoolId: number; dayOfWeek: number }
): Promise<ClearOverrideResult> {
  const period = await prisma.period.findFirst({ where: { id: params.periodId, schoolId: params.schoolId } });
  if (!period) return { ok: false, error: "NOT_FOUND" };

  await prisma.periodDayOverride.deleteMany({ where: { periodId: params.periodId, dayOfWeek: params.dayOfWeek } });
  return { ok: true };
}
