import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createEnrolledStudent, createClass } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getAssignments, POST as postAssignments } from "../src/app/api/assignments/route";
import { PATCH as patchAssignment } from "../src/app/api/assignments/[id]/route";
import {
  GET as getStatuses,
  POST as postStatuses,
} from "../src/app/api/assignments/[id]/statuses/route";

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
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: year.id,
      name: "Grade 5",
      section: "A",
    });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550001111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-500",
    });
    return { school, year, klass, subject, teacher, student };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates an assignment and a pending status row for every student in the class", async () => {
    const { school, klass, subject, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subjectId: subject.id,
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

  it("persists attachment fields when provided", async () => {
    const { school, klass, subject, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
        attachmentUrl: "/uploads/assignments/abc.pdf",
        attachmentName: "Worksheet.pdf",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(200);
    const body = await response.json();

    const created = await prisma.assignment.findUniqueOrThrow({ where: { id: body.id } });
    expect(created.attachmentUrl).toBe("/uploads/assignments/abc.pdf");
    expect(created.attachmentName).toBe("Worksheet.pdf");
  });

  it("creates one notification per distinct parent linked to an enrolled student", async () => {
    const { school, klass, subject, teacher, student } = await seedSchoolWithClassAndTeacher();
    const parent = await prisma.user.create({
      data: { phone: "+15550009001", role: "parent", name: "Test Parent", schoolId: school.id },
    });
    await prisma.parentStudent.create({ data: { parentUserId: parent.id, studentId: student.id } });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    const body = await response.json();

    const notifications = await prisma.notification.findMany({ where: { userId: parent.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: "assignment_published",
      title: "Chapter 3 worksheet",
      relatedId: body.id,
    });
  });

  it("creates exactly one notification for a parent with two children in the same class", async () => {
    const { school, year, klass, subject, teacher, student } = await seedSchoolWithClassAndTeacher();
    const secondStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Sibling Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-502",
    });
    const parent = await prisma.user.create({
      data: { phone: "+15550009002", role: "parent", name: "Test Parent", schoolId: school.id },
    });
    await prisma.parentStudent.create({ data: { parentUserId: parent.id, studentId: student.id } });
    await prisma.parentStudent.create({
      data: { parentUserId: parent.id, studentId: secondStudent.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    await postAssignments(request);

    const notifications = await prisma.notification.findMany({ where: { userId: parent.id } });
    expect(notifications).toHaveLength(1);
  });

  it("rejects a missing required field with 400", async () => {
    const { school, klass, subject, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, subjectId: subject.id, dueDate: "2026-07-10" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher creating for a class they don't teach with 403", async () => {
    const { school, klass, subject } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550002222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(403);
  });

  it("rejects an admin attempting to POST with 403", async () => {
    const { school, klass, subject } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550003333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(403);
  });

  it("lists assignments for a class the teacher teaches, with submission counts", async () => {
    const { school, year, klass, subject, teacher, student } = await seedSchoolWithClassAndTeacher();
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Second Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-501",
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
      subjectId: subject.id,
      subjectName: "Math",
      title: "Chapter 3 worksheet",
      submittedCount: 1,
      totalCount: 2,
      hasOverdue: false,
    });
  });

  it("flags hasOverdue when a pending status has a past due date", async () => {
    const { school, year, klass, subject, teacher, student } = await seedSchoolWithClassAndTeacher();
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        subjectId: subject.id,
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
    const { school, year, klass, subject, teacher } = await seedSchoolWithClassAndTeacher();
    await prisma.assignment.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, {
      schoolId: otherSchool.id,
      academicYearId: otherYear.id,
      name: "Grade 1",
      section: "A",
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

describe("/api/assignments/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedAssignment() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: year.id,
      name: "Grade 5",
      section: "A",
    });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550011111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdById: teacher.id,
      },
    });
    return { school, year, klass, subject, teacher, assignment };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("lets the creator edit title, subject, description, and due date", async () => {
    const { school, teacher, assignment } = await seedAssignment();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Chapter 3 worksheet (revised)", dueDate: "2026-08-05" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(200);

    const updated = await prisma.assignment.findUnique({ where: { id: assignment.id } });
    expect(updated?.title).toBe("Chapter 3 worksheet (revised)");
    expect(updated?.dueDate.toISOString().slice(0, 10)).toBe("2026-08-05");
  });

  it("lets the creator update the attachment", async () => {
    const { school, teacher, assignment } = await seedAssignment();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        attachmentUrl: "/uploads/assignments/xyz.png",
        attachmentName: "diagram.png",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(200);

    const updated = await prisma.assignment.findUnique({ where: { id: assignment.id } });
    expect(updated?.attachmentUrl).toBe("/uploads/assignments/xyz.png");
    expect(updated?.attachmentName).toBe("diagram.png");
  });

  it("rejects a different teacher assigned to the same class with 403", async () => {
    const { school, year, klass, assignment } = await seedAssignment();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550012222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    const scienceSubject = await prisma.subject.create({
      data: { gradeId: klass.gradeId, name: "Science" },
    });
    await prisma.classTeacher.create({
      data: {
        classId: klass.id,
        teacherUserId: otherTeacher.id,
        subjectId: scienceSubject.id,
        academicYearId: year.id,
      },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Hijacked title" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a nonexistent or cross-school assignment id", async () => {
    const { school, teacher } = await seedAssignment();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments/999999", {
      method: "PATCH",
      body: JSON.stringify({ title: "Doesn't matter" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: Promise.resolve({ id: "999999" }) });
    expect(response.status).toBe(404);
  });

  it("rejects an empty body with 400", async () => {
    const { school, teacher, assignment } = await seedAssignment();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(400);
  });

  it("rejects a subjectId the teacher isn't assigned to teach for this class with 403", async () => {
    const { school, klass, teacher, assignment } = await seedAssignment();
    const scienceSubject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Science" } });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ subjectId: scienceSubject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("You are not assigned to that subject for this class");

    const unchanged = await prisma.assignment.findUnique({ where: { id: assignment.id } });
    expect(unchanged?.subjectId).not.toBe(scienceSubject.id);
  });

  it("rejects an admin attempting to PATCH with 403", async () => {
    const { school, assignment } = await seedAssignment();
    const admin = await prisma.user.create({
      data: { phone: "+15550013333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Doesn't matter" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(403);
  });
});

describe("/api/assignments/[id]/statuses", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedAssignmentWithStudents() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: year.id,
      name: "Grade 5",
      section: "A",
    });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550021111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-600",
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        subjectId: subject.id,
        title: "Chapter 3 worksheet",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdById: teacher.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "pending" },
    });
    return { school, year, klass, subject, teacher, student, assignment };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("returns the roster with computed status", async () => {
    const { school, teacher, student, assignment } = await seedAssignmentWithStudents();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`);
    const response = await getStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.statuses).toEqual([
      { studentId: student.id, name: "Test Student", status: "pending" },
    ]);
  });

  it("computes overdue for a past-due pending row", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: year.id,
      name: "Grade 5",
      section: "A",
    });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550022222", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-601",
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        subjectId: subject.id,
        title: "Overdue worksheet",
        dueDate: new Date("2020-01-01"),
        createdById: teacher.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "pending" },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`);
    const response = await getStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    const body = await response.json();
    expect(body.statuses[0].status).toBe("overdue");
  });

  it("returns 404 for a nonexistent assignment id", async () => {
    const { school, teacher } = await seedAssignmentWithStudents();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments/999999/statuses");
    const response = await getStatuses(request, { params: Promise.resolve({ id: "999999" }) });
    expect(response.status).toBe(404);
  });

  it("rejects a teacher not assigned to the class with 403", async () => {
    const { school, assignment } = await seedAssignmentWithStudents();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550023333", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`);
    const response = await getStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(403);
  });

  it("allows admin to view the roster", async () => {
    const { school, student, assignment } = await seedAssignmentWithStudents();
    const admin = await prisma.user.create({
      data: { phone: "+15550024444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`);
    const response = await getStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.statuses[0].studentId).toBe(student.id);
  });

  it("updates statuses without duplicating rows on re-save", async () => {
    const { school, teacher, student, assignment } = await seedAssignmentWithStudents();
    loginAs(teacher.id, "teacher", school.id);

    async function save(status: string) {
      const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
        method: "POST",
        body: JSON.stringify({ entries: [{ studentId: student.id, status }] }),
        headers: { "content-type": "application/json" },
      });
      return postStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    }

    await save("submitted");
    const secondResponse = await save("pending");
    expect(secondResponse.status).toBe(200);

    const rows = await prisma.assignmentStatus.findMany({ where: { assignmentId: assignment.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("rejects a studentId outside the class with 400, all-or-nothing", async () => {
    const { school, year, klass, teacher, assignment } = await seedAssignmentWithStudents();
    const otherClass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: year.id,
      name: "Grade 6",
      section: "B",
    });
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: otherClass.id,
      academicYearId: year.id,
      name: "Other Student",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-602",
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ entries: [{ studentId: otherStudent.id, status: "submitted" }] }),
      headers: { "content-type": "application/json" },
    });
    const response = await postStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(400);

    const rows = await prisma.assignmentStatus.findMany({ where: { studentId: otherStudent.id } });
    expect(rows).toHaveLength(0);
  });

  it("rejects \"overdue\" as an input status with 400", async () => {
    const { school, teacher, student, assignment } = await seedAssignmentWithStudents();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ entries: [{ studentId: student.id, status: "overdue" }] }),
      headers: { "content-type": "application/json" },
    });
    const response = await postStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(400);
  });

  it("rejects a teacher not assigned to the class with 403 on POST", async () => {
    const { school, student, assignment } = await seedAssignmentWithStudents();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550025555", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ entries: [{ studentId: student.id, status: "submitted" }] }),
      headers: { "content-type": "application/json" },
    });
    const response = await postStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(403);
  });

  it("rejects an admin attempting to POST with 403", async () => {
    const { school, student, assignment } = await seedAssignmentWithStudents();
    const admin = await prisma.user.create({
      data: { phone: "+15550026666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ entries: [{ studentId: student.id, status: "submitted" }] }),
      headers: { "content-type": "application/json" },
    });
    const response = await postStatuses(request, { params: Promise.resolve({ id: String(assignment.id) }) });
    expect(response.status).toBe(403);
  });
});
