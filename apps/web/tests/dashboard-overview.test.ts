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
        academicYearId: fixtures.academicYear.id,
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

  it("computes per-class attendancePercent and attendanceTrend correctly across multiple classes", async () => {
    const fixtures = await createSeedFixtures(prisma);

    // Second class ("Grade 5 B") with its own student, distinct attendance record.
    const classB = await prisma.class.create({
      data: {
        schoolId: fixtures.school.id,
        gradeId: fixtures.grade.id,
        section: "B",
        academicYearId: fixtures.academicYear.id,
      },
    });
    const studentB = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Second Student",
        dob: new Date("2015-05-01"),
        admissionNo: "GH-2026-020",
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: studentB.id,
        classId: classB.id,
        academicYearId: fixtures.academicYear.id,
        status: "active",
        rollNumber: "GH-2026-020",
      },
    });

    // Third class ("Grade 5 C") with its own student, distinct attendance record.
    const classC = await prisma.class.create({
      data: {
        schoolId: fixtures.school.id,
        gradeId: fixtures.grade.id,
        section: "C",
        academicYearId: fixtures.academicYear.id,
      },
    });
    const studentC = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Third Student",
        dob: new Date("2015-06-01"),
        admissionNo: "GH-2026-021",
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: studentC.id,
        classId: classC.id,
        academicYearId: fixtures.academicYear.id,
        status: "active",
        rollNumber: "GH-2026-021",
      },
    });

    const todayStart = getSchoolLocalTodayStart();
    const dayMs = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => new Date(todayStart.getTime() - n * dayMs);

    // classA (fixtures.student): 3 present, 1 absent over the last 4 days -> 75%.
    await prisma.attendance.createMany({
      data: [
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: daysAgo(3), status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: daysAgo(2), status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: daysAgo(1), status: "absent", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: todayStart, status: "present", markedById: fixtures.teacher.id },
      ],
    });

    // classB (studentB): 1 present, 1 absent -> 50%.
    await prisma.attendance.createMany({
      data: [
        { studentId: studentB.id, academicYearId: fixtures.academicYear.id, date: daysAgo(2), status: "present", markedById: fixtures.teacher.id },
        { studentId: studentB.id, academicYearId: fixtures.academicYear.id, date: daysAgo(1), status: "absent", markedById: fixtures.teacher.id },
      ],
    });

    // classC (studentC): all absent -> 0%.
    await prisma.attendance.createMany({
      data: [
        { studentId: studentC.id, academicYearId: fixtures.academicYear.id, date: daysAgo(1), status: "absent", markedById: fixtures.teacher.id },
        { studentId: studentC.id, academicYearId: fixtures.academicYear.id, date: todayStart, status: "absent", markedById: fixtures.teacher.id },
      ],
    });

    const claims: SessionClaims = {
      userId: fixtures.admin.id,
      role: "admin",
      schoolId: fixtures.school.id,
    };
    const overview = await getDashboardOverview(prisma, claims);

    if (overview.role === "accountant") throw new Error("unexpected role");

    const byClassId = new Map(overview.classPerformance.map((c) => [c.classId, c]));
    expect(byClassId.get(fixtures.classA.id)?.attendancePercent).toBe(75);
    expect(byClassId.get(classB.id)?.attendancePercent).toBe(50);
    expect(byClassId.get(classC.id)?.attendancePercent).toBe(0);

    // classPerformance is sorted descending by attendancePercent.
    expect(overview.classPerformance.map((c) => c.classId)).toEqual([
      fixtures.classA.id,
      classB.id,
      classC.id,
    ]);

    // attendanceTrend covers only the top 3 classes (all 3 here) over the last 5 days,
    // skipping (date, class) pairs with no records that day.
    const dateStr = (n: number) => daysAgo(n).toISOString().slice(0, 10);
    const trendKey = (point: { date: string; classId: number }) => `${point.date}:${point.classId}`;
    const trendByKey = new Map(overview.attendanceTrend.map((p) => [trendKey(p), p]));

    expect(trendByKey.get(`${dateStr(3)}:${fixtures.classA.id}`)?.percent).toBe(100);
    expect(trendByKey.get(`${dateStr(2)}:${fixtures.classA.id}`)?.percent).toBe(100);
    expect(trendByKey.get(`${dateStr(1)}:${fixtures.classA.id}`)?.percent).toBe(0);
    expect(trendByKey.get(`${dateStr(0)}:${fixtures.classA.id}`)?.percent).toBe(100);

    expect(trendByKey.get(`${dateStr(2)}:${classB.id}`)?.percent).toBe(100);
    expect(trendByKey.get(`${dateStr(1)}:${classB.id}`)?.percent).toBe(0);
    expect(trendByKey.has(`${dateStr(3)}:${classB.id}`)).toBe(false);

    expect(trendByKey.get(`${dateStr(1)}:${classC.id}`)?.percent).toBe(0);
    expect(trendByKey.get(`${dateStr(0)}:${classC.id}`)?.percent).toBe(0);

    // Every trend className is "<gradeName> <section>".
    for (const point of overview.attendanceTrend) {
      expect(point.className).toMatch(/^Grade 5 [ABC]$/);
    }
  });

  it("weights half_day as half credit and drops excused from the denominator (75%, not 33% or 50%)", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const todayStart = getSchoolLocalTodayStart();
    const dayMs = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => new Date(todayStart.getTime() - n * dayMs);

    // 1 present, 1 half_day, 1 excused -> (1 + 0.5) / 2 marked days = 75%.
    // A naive present/late-only count would read 33% (1/3); a naive
    // present+late+halfDay-over-all-records count would read 50% (1.5/3).
    await prisma.attendance.createMany({
      data: [
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: daysAgo(2), status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: daysAgo(1), status: "half_day", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: todayStart, status: "excused", markedById: fixtures.teacher.id },
      ],
    });

    const claims: SessionClaims = {
      userId: fixtures.admin.id,
      role: "admin",
      schoolId: fixtures.school.id,
    };
    const overview = await getDashboardOverview(prisma, claims);

    if (overview.role === "accountant") throw new Error("unexpected role");

    const byClassId = new Map(overview.classPerformance.map((c) => [c.classId, c]));
    expect(byClassId.get(fixtures.classA.id)?.attendancePercent).toBe(75);
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
