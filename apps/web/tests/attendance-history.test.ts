import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentAttendanceMonth, getParentAttendanceYearSummary } from "../src/lib/parent/attendance-history";

describe("getParentAttendanceMonth", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns the requested month's attendance days and percent", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.attendance.createMany({
      data: [
        {
          studentId: fixtures.student.id,
          date: new Date("2026-06-02"),
          status: "present",
          markedById: fixtures.teacher.id,
        },
        {
          studentId: fixtures.student.id,
          date: new Date("2026-06-03"),
          status: "absent",
          markedById: fixtures.teacher.id,
        },
      ],
    });

    const result = await getParentAttendanceMonth(prisma, {
      studentId: fixtures.student.id,
      month: "2026-06",
    });

    expect(result.year).toBe(2026);
    expect(result.month).toBe(5);
    expect(result.monthLabel).toBe("June 2026");
    expect(result.percent).toBe(50);
    expect(result.days).toHaveLength(30);
    expect(result.days.find((d) => d.dayOfMonth === 2)?.status).toBe("present");
    expect(result.prevMonth).toBe("2026-05");
    expect(result.nextMonth).toBe("2026-07");
  });

  it("defaults to the current month when month is omitted", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const now = new Date();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const expectedLabel = `${monthNames[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

    const result = await getParentAttendanceMonth(prisma, { studentId: fixtures.student.id });

    expect(result.monthLabel).toBe(expectedLabel);
  });

  it("wraps prevMonth/nextMonth across a year boundary", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const result = await getParentAttendanceMonth(prisma, {
      studentId: fixtures.student.id,
      month: "2026-01",
    });

    expect(result.prevMonth).toBe("2025-12");
    expect(result.nextMonth).toBe("2026-02");
  });
});

describe("getParentAttendanceYearSummary", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("computes the overall attendance percent across the whole active academic year", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.attendance.createMany({
      data: [
        { studentId: fixtures.student.id, date: new Date("2026-06-02"), status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, date: new Date("2026-09-10"), status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, date: new Date("2026-12-15"), status: "absent", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, date: new Date("2027-02-01"), status: "late", markedById: fixtures.teacher.id },
      ],
    });

    const result = await getParentAttendanceYearSummary(prisma, fixtures.student.id);

    expect(result?.academicYearName).toBe(fixtures.academicYear.name);
    expect(result?.percent).toBe(75);
  });

  it("returns null when the student has no active enrollment", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.enrollment.updateMany({
      where: { studentId: fixtures.student.id },
      data: { status: "left" },
    });

    const result = await getParentAttendanceYearSummary(prisma, fixtures.student.id);

    expect(result).toBeNull();
  });

  it("returns 0 percent when there are no attendance records this year", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const result = await getParentAttendanceYearSummary(prisma, fixtures.student.id);

    expect(result?.percent).toBe(0);
  });
});
