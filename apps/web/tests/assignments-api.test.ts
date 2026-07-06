import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getAssignments, POST as postAssignments } from "../src/app/api/assignments/route";

describe("/api/assignments", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedSchoolWithClassAndTeacher() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550001111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math" },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Test Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-500",
      },
    });
    return { school, klass, teacher, student };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates an assignment and a pending status row for every student in the class", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBeTypeOf("number");

    const statuses = await prisma.assignmentStatus.findMany({ where: { assignmentId: body.id } });
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({ studentId: student.id, status: "pending" });
  });

  it("rejects a missing required field with 400", async () => {
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, subject: "Math", dueDate: "2026-07-10" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher creating for a class they don't teach with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550002222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(403);
  });

  it("rejects an admin attempting to POST with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550003333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(403);
  });

  it("lists assignments for a class the teacher teaches, with submission counts", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Second Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-501",
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: new Date("2026-08-01"),
        createdById: teacher.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "submitted" },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: otherStudent.id, status: "pending" },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${klass.id}`);
    const response = await getAssignments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0]).toMatchObject({
      id: assignment.id,
      subject: "Math",
      title: "Chapter 3 worksheet",
      submittedCount: 1,
      totalCount: 2,
      hasOverdue: false,
    });
  });

  it("flags hasOverdue when a pending status has a past due date", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Overdue worksheet",
        dueDate: new Date("2020-01-01"),
        createdById: teacher.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "pending" },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${klass.id}`);
    const response = await getAssignments(request);
    const body = await response.json();
    expect(body.assignments[0].hasOverdue).toBe(true);
  });

  it("rejects a teacher listing a class they don't teach with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550004444", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${klass.id}`);
    const response = await getAssignments(request);
    expect(response.status).toBe(403);
  });

  it("allows admin to list any class in their school", async () => {
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: new Date("2026-08-01"),
        createdById: teacher.id,
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550005555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${klass.id}`);
    const response = await getAssignments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assignments).toHaveLength(1);
  });

  it("rejects a classId from a different school with 400", async () => {
    const { school } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550006666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${otherClass.id}`);
    const response = await getAssignments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing classId with 400", async () => {
    const { school, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments");
    const response = await getAssignments(request);
    expect(response.status).toBe(400);
  });
});
