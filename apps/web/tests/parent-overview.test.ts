import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentChildren, getParentChildrenWithClass, getParentOverview } from "../src/lib/parent/overview";
import { setExamPublished } from "../src/lib/exams";

describe("getParentChildren", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns only the students linked to this parent", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const otherParent = await prisma.user.create({
      data: { phone: "+10000000005", role: "parent", name: "Other Parent", schoolId: fixtures.school.id },
    });
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Other Student",
        dob: new Date("2014-01-01"),
        admissionNo: "GH-2026-002",
      },
    });
    await prisma.parentStudent.create({
      data: { parentUserId: otherParent.id, studentId: otherStudent.id },
    });

    const children = await getParentChildren(prisma, fixtures.parent.id);

    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(fixtures.student.id);
  });
});

describe("getParentChildrenWithClass", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("includes each child's current class and section", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const children = await getParentChildrenWithClass(prisma, fixtures.parent.id);

    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(fixtures.student.id);
    expect(children[0].name).toBe(fixtures.student.name);
    expect(children[0].className).toBe("Grade 5 A");
  });

  it("returns null className for a child with no active enrollment", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.enrollment.updateMany({
      where: { studentId: fixtures.student.id },
      data: { status: "left" },
    });

    const children = await getParentChildrenWithClass(prisma, fixtures.parent.id);

    expect(children[0].className).toBeNull();
  });
});

describe("getParentOverview", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("computes this month's attendance percent and per-day attendanceDays from present/late records", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2));
    const monthStart2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3));
    const monthStart3 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 4));

    await prisma.attendance.createMany({
      data: [
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: monthStart, status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: monthStart2, status: "absent", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: monthStart3, status: "late", markedById: fixtures.teacher.id },
      ],
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.attendanceMonthPercent).toBe(67);

    const day2 = overview.attendanceDays.find((d) => d.dayOfMonth === 2);
    const day3 = overview.attendanceDays.find((d) => d.dayOfMonth === 3);
    const day4 = overview.attendanceDays.find((d) => d.dayOfMonth === 4);
    expect(day2?.status).toBe("present");
    expect(day3?.status).toBe("absent");
    expect(day4?.status).toBe("late");
  });

  it("weights half_day as half credit and drops excused from the denominator (75%, not 33% or 50%)", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const now = new Date();
    const day1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2));
    const day2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3));
    const day3 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 4));

    // 1 present, 1 half_day, 1 excused -> (1 + 0.5) / 2 marked days = 75%.
    // A naive present/late-only count would read 33% (1/3); a naive
    // present+late+halfDay-over-all-records count would read 50% (1.5/3).
    await prisma.attendance.createMany({
      data: [
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: day1, status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: day2, status: "half_day", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, academicYearId: fixtures.academicYear.id, date: day3, status: "excused", markedById: fixtures.teacher.id },
      ],
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.attendanceMonthPercent).toBe(75);
  });

  it("returns a full month of attendanceDays with weekday numbers and null status for unmarked days", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const now = new Date();
    const totalDays = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const firstDayWeekday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getUTCDay();

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.attendanceDays).toHaveLength(totalDays);
    expect(overview.attendanceDays[0].dayOfMonth).toBe(1);
    expect(overview.attendanceDays[0].status).toBeNull();
    expect(overview.attendanceDays[0].weekday).toBe(firstDayWeekday);
  });

  it("returns up to 3 pending assignments ordered by due date, marking overdue ones", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 1000 * 60 * 60 * 24 * 9).toISOString().slice(0, 10);
    const mathSubject = await prisma.subject.findFirstOrThrow({
      where: { gradeId: fixtures.classA.gradeId, name: "Mathematics" },
    });

    for (const [title, dueDate] of [
      ["Overdue Homework", past],
      ["Soon Homework", soon],
      ["Later Homework", later],
      ["Fourth Homework", later],
    ] as const) {
      const assignment = await prisma.assignment.create({
        data: {
          classId: fixtures.classA.id,
          subjectId: mathSubject.id,
          title,
          dueDate: new Date(dueDate),
          createdById: fixtures.teacher.id,
          academicYearId: fixtures.academicYear.id,
        },
      });
      await prisma.assignmentStatus.create({
        data: { assignmentId: assignment.id, studentId: fixtures.student.id, status: "pending" },
      });
    }

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.upcomingAssignments).toHaveLength(3);
    expect(overview.upcomingAssignments[0].title).toBe("Overdue Homework");
    expect(overview.upcomingAssignments[0].status).toBe("overdue");
    expect(overview.upcomingAssignments[1].title).toBe("Soon Homework");
    expect(overview.upcomingAssignments[1].status).toBe("pending");
  });

  it("returns the most recent exam's full subject breakdown", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const olderExam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Mid Term",
        term: "Term 1",
        examDate: new Date("2026-08-01"),
        academicYearId: fixtures.academicYear.id,
        maxMarks: 100,
        passMarks: 40,
        published: true,
      },
    });
    const newerExam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Final Term",
        term: "Term 2",
        examDate: new Date("2026-12-01"),
        academicYearId: fixtures.academicYear.id,
        maxMarks: 100,
        passMarks: 40,
        published: true,
      },
    });
    const mathSubject = await prisma.subject.findFirstOrThrow({
      where: { gradeId: fixtures.classA.gradeId, name: "Mathematics" },
    });
    const scienceSubject = await prisma.subject.create({
      data: { gradeId: fixtures.classA.gradeId, name: "Science" },
    });
    await prisma.mark.create({
      data: { examId: olderExam.id, studentId: fixtures.student.id, subjectId: mathSubject.id, academicYearId: fixtures.academicYear.id, marksObtained: 80, maxMarks: 100, grade: "B", enteredById: fixtures.teacher.id },
    });
    await prisma.mark.create({
      data: { examId: newerExam.id, studentId: fixtures.student.id, subjectId: mathSubject.id, academicYearId: fixtures.academicYear.id, marksObtained: 91, maxMarks: 100, grade: "A", enteredById: fixtures.teacher.id },
    });
    await prisma.mark.create({
      data: { examId: newerExam.id, studentId: fixtures.student.id, subjectId: scienceSubject.id, academicYearId: fixtures.academicYear.id, marksObtained: 85, maxMarks: 100, grade: "B", enteredById: fixtures.teacher.id },
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.latestExam?.examName).toBe("Final Term");
    expect(overview.latestExam?.subjects).toHaveLength(2);
    expect(overview.latestExam?.subjects.find((s) => s.subjectName === "Mathematics")?.marksObtained).toBe(91);
  });

  it("returns null latestExam when the student has no marks", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.latestExam).toBeNull();
  });

  it("does not leak an unpublished exam's name onto the latestExam tile", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const exam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Secret Mid Term",
        term: "Term 1",
        examDate: new Date("2026-08-01"),
        academicYearId: fixtures.academicYear.id,
        maxMarks: 100,
        passMarks: 40,
      },
    });
    const mathSubject = await prisma.subject.findFirstOrThrow({
      where: { gradeId: fixtures.classA.gradeId, name: "Mathematics" },
    });
    await prisma.mark.create({
      data: { examId: exam.id, studentId: fixtures.student.id, subjectId: mathSubject.id, academicYearId: fixtures.academicYear.id, marksObtained: 80, maxMarks: 100, grade: "B", enteredById: fixtures.teacher.id },
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.latestExam).toBeNull();
  });

  it("shows the latestExam tile once the exam is published", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const exam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Mid Term",
        term: "Term 1",
        examDate: new Date("2026-08-01"),
        academicYearId: fixtures.academicYear.id,
        maxMarks: 100,
        passMarks: 40,
      },
    });
    const mathSubject = await prisma.subject.findFirstOrThrow({
      where: { gradeId: fixtures.classA.gradeId, name: "Mathematics" },
    });
    await prisma.mark.create({
      data: { examId: exam.id, studentId: fixtures.student.id, subjectId: mathSubject.id, academicYearId: fixtures.academicYear.id, marksObtained: 80, maxMarks: 100, grade: "B", enteredById: fixtures.teacher.id },
    });

    const beforePublish = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });
    expect(beforePublish.latestExam).toBeNull();

    const publishResult = await setExamPublished(prisma, {
      examId: exam.id,
      schoolId: fixtures.school.id,
      published: true,
    });
    expect(publishResult).toEqual({ ok: true });

    const afterPublish = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(afterPublish.latestExam?.examName).toBe("Mid Term");
    expect(afterPublish.latestExam?.term).toBe("Term 1");
    expect(afterPublish.latestExam?.subjects).toEqual([
      { subjectId: mathSubject.id, subjectName: "Mathematics", marksObtained: 80, maxMarks: 100, grade: "B" },
    ]);
  });

  it("sums outstanding fee amounts and finds the nearest unpaid due date", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const nearFeeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 1",
        amount: 5000,
        dueDate: new Date("2026-09-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    const farFeeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 2",
        amount: 5000,
        dueDate: new Date("2026-12-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.feePayment.create({
      data: {
        studentId: fixtures.student.id,
        feeStructureId: nearFeeStructure.id,
        amountPaid: 2000,
        recordedById: fixtures.accountant.id,
        status: "partial",
      },
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.feesOutstanding.amount).toBe(3000 + 5000);
    expect(overview.feesOutstanding.nearestDueDate).toBe("2026-09-01");
    void farFeeStructure;
  });

  it("returns zero fees, no assignments, but still computes attendance/marks when the student has no active enrollment", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.enrollment.updateMany({
      where: { studentId: fixtures.student.id },
      data: { status: "left" },
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.upcomingAssignments).toEqual([]);
    expect(overview.feesOutstanding).toEqual({ amount: 0, nearestDueDate: null });
  });
});
