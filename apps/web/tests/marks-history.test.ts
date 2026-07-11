import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentMarksHistory } from "../src/lib/parent/marks-history";

describe("getParentMarksHistory", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("groups marks by exam, newest exam first, with full subject breakdowns", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const olderExam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Mid Term",
        term: "Term 1",
        examDate: new Date("2026-08-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    const newerExam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Final Term",
        term: "Term 2",
        examDate: new Date("2026-12-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.mark.create({
      data: { examId: olderExam.id, studentId: fixtures.student.id, subject: "Mathematics", marksObtained: 70, maxMarks: 100, grade: "C" },
    });
    await prisma.mark.create({
      data: { examId: newerExam.id, studentId: fixtures.student.id, subject: "Mathematics", marksObtained: 91, maxMarks: 100, grade: "A" },
    });
    await prisma.mark.create({
      data: { examId: newerExam.id, studentId: fixtures.student.id, subject: "Science", marksObtained: 85, maxMarks: 100, grade: "B" },
    });

    const history = await getParentMarksHistory(prisma, fixtures.student.id);

    expect(history).toHaveLength(2);
    expect(history[0].examName).toBe("Final Term");
    expect(history[0].subjects).toHaveLength(2);
    expect(history[1].examName).toBe("Mid Term");
    expect(history[1].subjects).toHaveLength(1);
  });

  it("returns an empty array when the student has no marks", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const history = await getParentMarksHistory(prisma, fixtures.student.id);

    expect(history).toEqual([]);
  });
});
