import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { listPeriods, createPeriod, deletePeriod, setPeriodDayOverride, clearPeriodDayOverride } from "../src/lib/periods";

describe("periods lib", () => {
  let schoolId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
  });

  it("creates a period with global default times", async () => {
    const created = await createPeriod(prisma, schoolId, { order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" });
    expect(created.ok).toBe(true);

    const periods = await listPeriods(prisma, schoolId);
    expect(periods).toEqual([
      { id: expect.any(Number), order: 1, label: "Period 1", isBreak: false, startTime: "09:00", endTime: "09:45", overridesByDay: {} },
    ]);
  });

  it("rejects duplicate order within a school", async () => {
    await createPeriod(prisma, schoolId, { order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" });
    const duplicate = await createPeriod(prisma, schoolId, { order: 1, label: "Period 1 dup", startTime: "10:00", endTime: "10:45" });
    expect(duplicate).toEqual({ ok: false, error: "DUPLICATE_ORDER" });
  });

  it("sets and clears a per-day override", async () => {
    const created = await createPeriod(prisma, schoolId, { order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" });
    if (!created.ok) throw new Error("setup failed");

    const setResult = await setPeriodDayOverride(prisma, {
      periodId: created.period.id,
      schoolId,
      dayOfWeek: 5,
      startTime: "09:10",
      endTime: "09:50",
    });
    expect(setResult).toEqual({ ok: true });

    let periods = await listPeriods(prisma, schoolId);
    expect(periods[0].overridesByDay[5]).toEqual({ startTime: "09:10", endTime: "09:50" });

    await clearPeriodDayOverride(prisma, { periodId: created.period.id, schoolId, dayOfWeek: 5 });
    periods = await listPeriods(prisma, schoolId);
    expect(periods[0].overridesByDay[5]).toBeUndefined();
  });

  it("blocks deleting a period that has timetable entries", async () => {
    const created = await createPeriod(prisma, schoolId, { order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" });
    if (!created.ok) throw new Error("setup failed");
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date(), endDate: new Date(), status: "active" },
    });
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Math" } });
    const klass = await prisma.class.create({ data: { schoolId, section: "A", gradeId: grade.id, academicYearId: year.id } });
    await prisma.timetableEntry.create({
      data: { classId: klass.id, dayOfWeek: 1, periodId: created.period.id, subjectId: subject.id, academicYearId: year.id },
    });

    const result = await deletePeriod(prisma, { periodId: created.period.id, schoolId });
    expect(result).toEqual({ ok: false, error: "HAS_HISTORY" });
  });
});
