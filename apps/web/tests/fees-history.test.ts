import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentFeesHistory } from "../src/lib/parent/fees-history";
import { createClass } from "./helpers/enrollment";

describe("getParentFeesHistory", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns fee structures across every class/year the student has been enrolled in", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const priorYear = await prisma.academicYear.create({
      data: {
        schoolId: fixtures.school.id,
        name: "2025-26",
        startDate: new Date("2025-06-01"),
        endDate: new Date("2026-04-30"),
        status: "archived",
      },
    });
    const priorClass = await createClass(prisma, {
      schoolId: fixtures.school.id,
      academicYearId: priorYear.id,
      name: "Grade 4",
      section: "A",
    });
    await prisma.enrollment.create({
      data: {
        studentId: fixtures.student.id,
        classId: priorClass.id,
        academicYearId: priorYear.id,
        status: "promoted",
        rollNumber: "OLD-001",
      },
    });

    const currentStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 1",
        amount: 5000,
        dueDate: new Date("2026-09-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    const priorStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: priorClass.id,
        term: "Term 1",
        amount: 4000,
        dueDate: new Date("2025-09-01"),
        academicYearId: priorYear.id,
      },
    });
    await prisma.feePayment.create({
      data: {
        studentId: fixtures.student.id,
        feeStructureId: priorStructure.id,
        amountPaid: 4000,
        paidDate: new Date(),
        mode: "cash",
        receiptNo: "R-TEST-0001",
        recordedById: fixtures.accountant.id,
      },
    });

    const history = await getParentFeesHistory(prisma, fixtures.student.id);

    expect(history).toHaveLength(2);
    const current = history.find((h) => h.id === currentStructure.id);
    const prior = history.find((h) => h.id === priorStructure.id);
    expect(current?.status).toBe("unpaid");
    expect(current?.amountPaid).toBe(0);
    expect(prior?.status).toBe("paid");
    expect(prior?.amountPaid).toBe(4000);
    expect(prior?.className).toBe("Grade 4 A");
  });

  it("returns an empty array when the student has no enrollment history", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.enrollment.deleteMany({ where: { studentId: fixtures.student.id } });

    const history = await getParentFeesHistory(prisma, fixtures.student.id);

    expect(history).toEqual([]);
  });

  it("reports the net-of-discount amount rather than the sticker amount", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const structure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 1",
        amount: 5000,
        discount: 500,
        dueDate: new Date("2026-12-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });

    const history = await getParentFeesHistory(prisma, fixtures.student.id);

    const entry = history.find((h) => h.id === structure.id);
    expect(entry?.amount).toBe(4500);
  });

  it("includes the fine in the reported amount once the due date has passed", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const structure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 1",
        amount: 5000,
        fineAmount: 200,
        dueDate: new Date("2020-01-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });

    const history = await getParentFeesHistory(prisma, fixtures.student.id);

    const entry = history.find((h) => h.id === structure.id);
    expect(entry?.amount).toBe(5200);
    expect(entry?.status).toBe("overdue");
  });
});
