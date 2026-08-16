import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getDashboardOverview } from "../src/lib/dashboard/overview";
import type { SessionClaims } from "../src/lib/auth/jwt";
import { getSchoolLocalTodayStart } from "../src/lib/date-utils";

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

    const otherGrade = await prisma.grade.create({
      data: { schoolId: fixtures.school.id, name: "Grade 6" },
    });
    const otherClass = await prisma.class.create({
      data: {
        schoolId: fixtures.school.id,
        gradeId: otherGrade.id,
        section: "B",
        academicYearId: fixtures.academicYear.id,
      },
    });
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Other Student",
        dob: new Date("2014-01-01"),
        admissionNo: "GH-2026-002",
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: otherStudent.id,
        classId: otherClass.id,
        academicYearId: fixtures.academicYear.id,
        status: "active",
        rollNumber: "GH-2026-002",
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

    const otherGrade = await prisma.grade.create({
      data: { schoolId: fixtures.school.id, name: "Grade 6" },
    });
    const otherClass = await prisma.class.create({
      data: {
        schoolId: fixtures.school.id,
        gradeId: otherGrade.id,
        section: "B",
        academicYearId: fixtures.academicYear.id,
      },
    });
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Other Student",
        dob: new Date("2014-01-01"),
        admissionNo: "GH-2026-002",
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: otherStudent.id,
        classId: otherClass.id,
        academicYearId: fixtures.academicYear.id,
        status: "active",
        rollNumber: "GH-2026-002",
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
    // getDashboardOverview's "today" window is anchored to the school's local
    // (IST) calendar date, not the server's UTC date -- see src/lib/date-utils.ts.
    const today = getSchoolLocalTodayStart();
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
        academicYearId: fixtures.academicYear.id,
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

  it("computes outstanding amount and collection percent against the true class-wide total due, not the per-student fee amount", async () => {
    const fixtures = await createSeedFixtures(prisma);

    // fixtures.student is already enrolled in classA. Add two more students to
    // classA so the fee structure's per-student amount must be multiplied by
    // the class roster size to get the true amount due.
    const studentB = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Second Student",
        dob: new Date("2015-05-01"),
        admissionNo: "GH-2026-010",
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: studentB.id,
        classId: fixtures.classA.id,
        academicYearId: fixtures.academicYear.id,
        status: "active",
        rollNumber: "GH-2026-010",
      },
    });
    const studentC = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Third Student",
        dob: new Date("2015-06-01"),
        admissionNo: "GH-2026-011",
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: studentC.id,
        classId: fixtures.classA.id,
        academicYearId: fixtures.academicYear.id,
        status: "active",
        rollNumber: "GH-2026-011",
      },
    });

    const feeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        academicYearId: fixtures.academicYear.id,
        term: "Term 1",
        amount: 1000, // per-student amount
        dueDate: new Date("2026-09-01"),
      },
    });

    // Student 1 pays in full, student 2 pays half, student 3 pays nothing.
    await prisma.feePayment.create({
      data: {
        studentId: fixtures.student.id,
        feeStructureId: feeStructure.id,
        amountPaid: 1000,
        paidDate: new Date(),
        recordedById: fixtures.accountant.id,
        status: "paid",
      },
    });
    await prisma.feePayment.create({
      data: {
        studentId: studentB.id,
        feeStructureId: feeStructure.id,
        amountPaid: 500,
        paidDate: new Date(),
        recordedById: fixtures.accountant.id,
        status: "partial",
      },
    });
    void studentC;

    const claims: SessionClaims = {
      userId: fixtures.accountant.id,
      role: "accountant",
      schoolId: fixtures.school.id,
    };
    const overview = await getDashboardOverview(prisma, claims);

    expect(overview.role).toBe("accountant");
    if (overview.role !== "accountant") throw new Error("unexpected role");

    // True total due = 1000/student * 3 students = 3000. Total paid = 1500.
    expect(overview.feeStructureCollection[0].totalDue).toBe(3000);
    expect(overview.feeStructureCollection[0].totalPaid).toBe(1500);
    expect(overview.feeStructureCollection[0].collectionPercent).toBe(50);
    expect(overview.outstandingAmount).toBe(1500);
  });
});
