import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import {
  getParentAssignmentHistory,
  getParentAssignmentDetail,
} from "../src/lib/parent/assignments-history";

describe("getParentAssignmentHistory", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns every assignment status for the student regardless of status, newest due date first", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const older = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "Mathematics",
        title: "Worksheet 1",
        dueDate: new Date("2026-07-01"),
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    const newer = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "Science",
        title: "Lab Report",
        dueDate: new Date("2026-08-01"),
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: older.id, studentId: fixtures.student.id, status: "submitted" },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: newer.id, studentId: fixtures.student.id, status: "pending" },
    });

    const history = await getParentAssignmentHistory(prisma, fixtures.student.id);

    expect(history).toHaveLength(2);
    expect(history[0].title).toBe("Lab Report");
    expect(history[0].status).toBe("pending");
    expect(history[0].className).toBe("Grade 5 A");
    expect(history[1].title).toBe("Worksheet 1");
    expect(history[1].status).toBe("submitted");
  });

  it("returns an empty array when the student has no assignment statuses", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const history = await getParentAssignmentHistory(prisma, fixtures.student.id);

    expect(history).toEqual([]);
  });

  it("filters to pending (including overdue) when status: 'pending' is passed", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const pendingAssignment = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "Mathematics",
        title: "Pending HW",
        dueDate: new Date("2026-08-01"),
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    const overdueAssignment = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "Science",
        title: "Overdue HW",
        dueDate: new Date("2020-01-01"),
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    const submittedAssignment = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "English",
        title: "Submitted HW",
        dueDate: new Date("2026-07-01"),
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: pendingAssignment.id, studentId: fixtures.student.id, status: "pending" },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: overdueAssignment.id, studentId: fixtures.student.id, status: "pending" },
    });
    await prisma.assignmentStatus.create({
      data: {
        assignmentId: submittedAssignment.id,
        studentId: fixtures.student.id,
        status: "submitted",
      },
    });

    const pending = await getParentAssignmentHistory(prisma, fixtures.student.id, { status: "pending" });
    expect(pending.map((entry) => entry.title).sort()).toEqual(["Overdue HW", "Pending HW"]);

    const submitted = await getParentAssignmentHistory(prisma, fixtures.student.id, {
      status: "submitted",
    });
    expect(submitted.map((entry) => entry.title)).toEqual(["Submitted HW"]);
  });
});

describe("getParentAssignmentDetail", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns the full detail including description and attachment for the student's own assignment", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const assignment = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "Mathematics",
        title: "Worksheet 3",
        description: "Complete pages 4-6",
        dueDate: new Date("2026-08-01"),
        attachmentUrl: "/uploads/assignments/abc.pdf",
        attachmentName: "Worksheet3.pdf",
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: fixtures.student.id, status: "pending" },
    });

    const detail = await getParentAssignmentDetail(prisma, {
      studentId: fixtures.student.id,
      assignmentId: assignment.id,
    });

    expect(detail).toMatchObject({
      id: assignment.id,
      title: "Worksheet 3",
      subject: "Mathematics",
      className: "Grade 5 A",
      status: "pending",
      description: "Complete pages 4-6",
      attachmentUrl: "/uploads/assignments/abc.pdf",
      attachmentName: "Worksheet3.pdf",
    });
  });

  it("returns null when the student has no status row for that assignment", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Other Student",
        dob: new Date("2015-01-01"),
        admissionNo: "GH-2026-777",
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "Mathematics",
        title: "Worksheet 3",
        dueDate: new Date("2026-08-01"),
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: otherStudent.id, status: "pending" },
    });

    const detail = await getParentAssignmentDetail(prisma, {
      studentId: fixtures.student.id,
      assignmentId: assignment.id,
    });

    expect(detail).toBeNull();
  });

  it("returns null for a nonexistent assignment id", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const detail = await getParentAssignmentDetail(prisma, {
      studentId: fixtures.student.id,
      assignmentId: 999999,
    });

    expect(detail).toBeNull();
  });
});
