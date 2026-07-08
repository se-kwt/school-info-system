import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getDashboardOverview } from "../src/lib/dashboard/overview";
import type { SessionClaims } from "../src/lib/auth/jwt";

describe("getDashboardOverview", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("scopes a teacher's overview to only their assigned classes", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const otherClass = await prisma.class.create({
      data: { schoolId: fixtures.school.id, name: "Grade 6", section: "B" },
    });
    await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Other Student",
        dob: new Date("2014-01-01"),
        classId: otherClass.id,
        section: "B",
        admissionNo: "GH-2026-002",
      },
    });

    const claims: SessionClaims = {
      userId: fixtures.teacher.id,
      role: "teacher",
      schoolId: fixtures.school.id,
    };

    const overview = await getDashboardOverview(prisma, claims);

    expect(overview.role).toBe("teacher");
    if (overview.role === "accountant") throw new Error("unexpected role");
    expect(overview.totalStudents).toBe(1);
    expect(overview.classPerformance).toHaveLength(1);
    expect(overview.classPerformance[0].classId).toBe(fixtures.classA.id);
  });

  it("scopes an admin's overview to every class in the school", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const otherClass = await prisma.class.create({
      data: { schoolId: fixtures.school.id, name: "Grade 6", section: "B" },
    });
    await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Other Student",
        dob: new Date("2014-01-01"),
        classId: otherClass.id,
        section: "B",
        admissionNo: "GH-2026-002",
      },
    });

    const claims: SessionClaims = {
      userId: fixtures.admin.id,
      role: "admin",
      schoolId: fixtures.school.id,
    };

    const overview = await getDashboardOverview(prisma, claims);

    expect(overview.role).toBe("admin");
    if (overview.role === "accountant") throw new Error("unexpected role");
    expect(overview.totalStudents).toBe(2);
  });

  it("returns a null today's-attendance percent when nothing has been marked yet", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const claims: SessionClaims = {
      userId: fixtures.teacher.id,
      role: "teacher",
      schoolId: fixtures.school.id,
    };

    const overview = await getDashboardOverview(prisma, claims);

    if (overview.role === "accountant") throw new Error("unexpected role");
    expect(overview.todayAttendancePercent).toBeNull();
  });

  it("computes today's attendance percent once attendance is marked", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const today = new Date(new Date().toISOString().slice(0, 10));
    await prisma.attendance.create({
      data: {
        studentId: fixtures.student.id,
        date: today,
        status: "present",
        markedById: fixtures.teacher.id,
      },
    });

    const claims: SessionClaims = {
      userId: fixtures.teacher.id,
      role: "teacher",
      schoolId: fixtures.school.id,
    };
    const overview = await getDashboardOverview(prisma, claims);

    if (overview.role === "accountant") throw new Error("unexpected role");
    expect(overview.todayAttendancePercent).toBe(100);
  });

  it("returns a fees-only, school-wide overview for accountant", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const feeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 1",
        amount: 1000,
        dueDate: new Date("2026-09-01"),
      },
    });
    await prisma.feePayment.create({
      data: {
        studentId: fixtures.student.id,
        feeStructureId: feeStructure.id,
        amountPaid: 400,
        paidDate: new Date(),
        recordedById: fixtures.accountant.id,
        status: "partial",
      },
    });

    const claims: SessionClaims = {
      userId: fixtures.accountant.id,
      role: "accountant",
      schoolId: fixtures.school.id,
    };
    const overview = await getDashboardOverview(prisma, claims);

    expect(overview.role).toBe("accountant");
    if (overview.role !== "accountant") throw new Error("unexpected role");
    expect(overview.feesCollectedThisTerm).toBe(400);
    expect(overview.outstandingAmount).toBe(600);
    expect(overview.activeFeeStructures).toBe(1);
    expect(overview.feeStructureCollection[0].collectionPercent).toBe(40);
  });
});
