import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createClass, createEnrolledStudent } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getStudents, POST as postStudents } from "../src/app/api/students/route";
import { PATCH as patchStudent, DELETE as deleteStudentRoute } from "../src/app/api/students/[id]/route";
import { PATCH as deactivateStudentRoute } from "../src/app/api/students/[id]/deactivate/route";
import { PATCH as activateStudentRoute } from "../src/app/api/students/[id]/activate/route";

describe("/api/students", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15551110002", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a student linked to an existing parent", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
    const parent = await prisma.user.create({
      data: { phone: "+15558880001", role: "parent", name: "Existing Parent", schoolId: school.id },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "New Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-001",
        parents: [{ relationship: "guardian", name: "Existing Parent", phone: parent.phone }],
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);

    const link = await prisma.parentStudent.findFirst({ where: { parentUserId: parent.id } });
    expect(link).not.toBeNull();
  });

  it("creates a student and a new parent in one request", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 4", section: "A" });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Another Student",
        dob: "2015-06-15",
        classId: klass.id,
        admissionNo: "SCH-002",
        parents: [{ relationship: "guardian", name: "Brand New Parent", phone: "+15558880002" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);

    const newParent = await prisma.user.findUnique({ where: { phone: "+15558880002" } });
    expect(newParent).toMatchObject({ name: "Brand New Parent", role: "parent" });

    const getRequest = new Request("http://localhost/api/students");
    const getResponse = await getStudents(getRequest);
    const list = await getResponse.json();
    const created = list.find((entry: { admissionNo: string }) => entry.admissionNo === "SCH-002");
    expect(created.parents).toEqual([
      { relationship: "guardian", name: "Brand New Parent", phone: "+15558880002", email: null },
    ]);
  });

  it("rejects a duplicate admission number with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Existing Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-003",
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Duplicate",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-003",
        parents: [{ relationship: "guardian", name: "Some Parent", phone: "+15558880003" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a parentPhone belonging to a non-parent role with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 6", section: "A" });
    const teacher = await prisma.user.create({
      data: { phone: "+15558880004", role: "teacher", name: "A Teacher", schoolId: school.id },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Blocked Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-004",
        parents: [{ relationship: "guardian", name: "A Teacher", phone: teacher.phone }],
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects create with an empty parents array with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 7", section: "A" });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "No Parent",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-005",
        parents: [],
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects a classId belonging to a different school with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Cross Tenant",
        dob: "2016-01-01",
        classId: otherClass.id,
        admissionNo: "SCH-999",
        parents: [{ relationship: "guardian", name: "Some Parent", phone: "+15558889999" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("creates a student with a roll number and photo url", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 8", section: "A" });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Roll Number Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-ROLL-1",
        rollNumber: "5",
        photoUrl: "/uploads/students/x.png",
        parents: [{ relationship: "guardian", name: "Some Parent", phone: "+15558880010" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);

    const getRequest = new Request("http://localhost/api/students");
    const getResponse = await getStudents(getRequest);
    const list = await getResponse.json();
    const created = list.find((entry: { admissionNo: string }) => entry.admissionNo === "SCH-ROLL-1");
    expect(created).toMatchObject({ rollNumber: "5", photoUrl: "/uploads/students/x.png" });
  });

  it("rejects a duplicate rollNumber within the same class and year with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 9", section: "A" });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "First Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-ROLL-2",
    });
    await prisma.enrollment.updateMany({
      where: { classId: klass.id, academicYearId: year.id },
      data: { rollNumber: "7" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Second Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-ROLL-3",
        rollNumber: "7",
        parents: [{ relationship: "guardian", name: "Some Parent", phone: "+15558880011" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });
});

describe("/api/students/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15551110030", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("edits name, dob, and admission number", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Original Name",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-1",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Name", admissionNo: "SCH-EDIT-1B" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(200);

    const updated = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updated).toMatchObject({ name: "Updated Name", admissionNo: "SCH-EDIT-1B" });
  });

  it("reassigns the student's active-year enrollment to a different class", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const gradeA = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const gradeB = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, gradeId: gradeA.gradeId, section: "B" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: gradeA.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-2",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ classId: gradeB.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(200);

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    });
    expect(enrollment?.classId).toBe(gradeB.id);
  });

  it("rejects a duplicate admission number on edit with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Existing",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-TAKEN",
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Other",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-3",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ admissionNo: "SCH-TAKEN" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(409);
  });

  it("deletes a student with zero recorded history", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Fresh Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-DEL-1",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, { method: "DELETE" });
    const response = await deleteStudentRoute(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(200);

    const found = await prisma.student.findUnique({ where: { id: student.id } });
    expect(found).toBeNull();
  });

  it("rejects deleting a student with recorded history, offering deactivate", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const teacher = await prisma.user.create({
      data: { phone: "+15559991099", role: "teacher", name: "A Teacher", schoolId: school.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "History Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-DEL-2",
    });
    await prisma.attendance.create({
      data: { studentId: student.id, academicYearId: year.id, date: new Date("2026-07-01"), status: "present", markedById: teacher.id },
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, { method: "DELETE" });
    const response = await deleteStudentRoute(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.deletable).toBe(false);
  });

  it("deactivates a student and their active-year enrollment", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "To Deactivate",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-DEACT-1",
    });

    const request = new Request(`http://localhost/api/students/${student.id}/deactivate`, { method: "PATCH" });
    const response = await deactivateStudentRoute(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(200);

    const updatedStudent = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updatedStudent?.status).toBe("inactive");
    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    });
    expect(enrollment?.status).toBe("inactive");
  });

  it("reactivates a deactivated student and their active-year enrollment", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "To Reactivate",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-REACT-1",
    });

    await deactivateStudentRoute(
      new Request(`http://localhost/api/students/${student.id}/deactivate`, { method: "PATCH" }),
      { params: Promise.resolve({ id: String(student.id) }) }
    );

    const request = new Request(`http://localhost/api/students/${student.id}/activate`, { method: "PATCH" });
    const response = await activateStudentRoute(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(200);

    const updatedStudent = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updatedStudent?.status).toBe("active");
    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    });
    expect(enrollment?.status).toBe("active");
  });

  it("returns 404 for a cross-school student id", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: otherSchool.id,
      classId: otherClass.id,
      academicYearId: otherYear.id,
      name: "Cross Tenant",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-CROSS-1",
    });

    const request = new Request(`http://localhost/api/students/${otherStudent.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Hijack" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: Promise.resolve({ id: String(otherStudent.id) }) });
    expect(response.status).toBe(404);
  });

  it("updates rollNumber and photoUrl", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-ROLL-1",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: student.name, admissionNo: student.admissionNo, rollNumber: "3", photoUrl: "/uploads/students/y.png" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(200);

    const updatedStudent = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updatedStudent?.photoUrl).toBe("/uploads/students/y.png");
    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    });
    expect(enrollment?.rollNumber).toBe("3");
  });

  it("rejects a duplicate rollNumber on edit within the same class and year with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Taken",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-ROLL-2",
    });
    await prisma.enrollment.updateMany({
      where: { classId: klass.id, academicYearId: year.id },
      data: { rollNumber: "9" },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Other",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-ROLL-3",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: student.name, admissionNo: student.admissionNo, rollNumber: "9" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: Promise.resolve({ id: String(student.id) }) });
    expect(response.status).toBe(409);
  });
});
