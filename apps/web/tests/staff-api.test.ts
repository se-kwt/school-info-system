import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createClass } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getStaff, POST as postStaff } from "../src/app/api/staff/route";
import { PATCH as patchStaff, DELETE as deleteStaffRoute } from "../src/app/api/staff/[id]/route";
import { PATCH as deactivateStaffRoute } from "../src/app/api/staff/[id]/deactivate/route";
import { PATCH as activateStaffRoute } from "../src/app/api/staff/[id]/activate/route";

describe("/api/staff", () => {
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
      data: { phone: "+15551110001", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a non-teacher staff member and lists them", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({ name: "New Accountant", phone: "+15559990001", role: "accountant" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(201);

    const getRequest = new Request("http://localhost/api/staff");
    const getResponse = await getStaff(getRequest);
    const list = await getResponse.json();
    expect(list).toHaveLength(2);
    const accountant = list.find((entry: { role: string }) => entry.role === "accountant");
    expect(accountant).toMatchObject({
      name: "New Accountant",
      phone: "+15559990001",
      classAssignment: null,
    });
  });

  it("creates a teacher with a class assignment and reflects it in the list", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 7", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Science" } });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: "New Teacher",
        phone: "+15559990002",
        role: "teacher",
        classId: klass.id,
        subjectId: subject.id,
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(201);

    const classTeacherRow = await prisma.classTeacher.findFirst({
      where: { classId: klass.id, subjectId: subject.id },
    });
    expect(classTeacherRow).not.toBeNull();

    const getRequest = new Request("http://localhost/api/staff");
    const getResponse = await getStaff(getRequest);
    const list = await getResponse.json();
    const teacher = list.find((entry: { role: string }) => entry.role === "teacher");
    expect(teacher.classAssignment).toEqual({
      gradeName: "Grade 7",
      section: "A",
      subjectName: "Science",
    });
  });

  it("rejects a duplicate phone with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    await prisma.user.create({
      data: { phone: "+15559990003", role: "teacher", name: "Existing Teacher", schoolId: school.id },
    });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({ name: "Duplicate", phone: "+15559990003", role: "teacher" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a teacher with a classId but no subject with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 8", section: "A" });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: "No Subject",
        phone: "+15559990004",
        role: "teacher",
        classId: klass.id,
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects a non-admin role with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15559990005", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const getRequest = new Request("http://localhost/api/staff");
    const getResponse = await getStaff(getRequest);
    expect(getResponse.status).toBe(403);
  });

  it("rejects a classId belonging to a different school with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id, "2026-27-other");
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
    const otherSubject = await prisma.subject.create({ data: { gradeId: otherClass.gradeId, name: "Math" } });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: "Cross Tenant Teacher",
        phone: "+15559990099",
        role: "teacher",
        classId: otherClass.id,
        subjectId: otherSubject.id,
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(400);
  });
});

describe("/api/staff/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedAdminAndTeacher(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15559991001", role: "admin", name: "Test Admin", schoolId },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15559991002", role: "teacher", name: "Test Teacher", schoolId },
    });
    return { admin, teacher };
  }

  function loginAs(userId: number, schoolId: number) {
    const token = signSessionToken({ userId, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("edits name, phone, and role", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed Teacher", role: "accountant" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStaff(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: teacher.id } });
    expect(updated).toMatchObject({ name: "Renamed Teacher", role: "accountant" });
  });

  it("assigns a class+subject to a teacher when an active year exists", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, {
      method: "PATCH",
      body: JSON.stringify({ classId: klass.id, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStaff(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const assignment = await prisma.classTeacher.findFirst({
      where: { teacherUserId: teacher.id, academicYearId: year.id },
    });
    expect(assignment).toMatchObject({ classId: klass.id, subjectId: subject.id });
  });

  it("clears a class assignment when role changes away from teacher", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "accountant" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStaff(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const assignment = await prisma.classTeacher.findFirst({ where: { teacherUserId: teacher.id } });
    expect(assignment).toBeNull();
  });

  it("rejects assigning a class to a non-teacher role with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "accountant", classId: klass.id, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStaff(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(400);
  });

  it("deletes a staff member with zero recorded activity", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, { method: "DELETE" });
    const response = await deleteStaffRoute(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const found = await prisma.user.findUnique({ where: { id: teacher.id } });
    expect(found).toBeNull();
  });

  it("rejects deleting a staff member with recorded activity, offering deactivate", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    const period = await prisma.period.create({
      data: { schoolId: school.id, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" },
    });
    await prisma.timetableEntry.create({
      data: {
        classId: klass.id,
        dayOfWeek: 1,
        periodId: period.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
        academicYearId: year.id,
      },
    });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, { method: "DELETE" });
    const response = await deleteStaffRoute(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.deletable).toBe(false);
  });

  it("rejects deleting your own account with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${admin.id}`, { method: "DELETE" });
    const response = await deleteStaffRoute(request, { params: { id: String(admin.id) } });
    expect(response.status).toBe(403);
  });

  it("deactivates a staff member and clears their current-year assignment", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}/deactivate`, { method: "PATCH" });
    const response = await deactivateStaffRoute(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: teacher.id } });
    expect(updated?.status).toBe("inactive");
    const assignment = await prisma.classTeacher.findFirst({ where: { teacherUserId: teacher.id } });
    expect(assignment).toBeNull();
  });

  it("rejects deactivating your own account with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${admin.id}/deactivate`, { method: "PATCH" });
    const response = await deactivateStaffRoute(request, { params: { id: String(admin.id) } });
    expect(response.status).toBe(403);
  });

  it("reactivates a deactivated staff member", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    await deactivateStaffRoute(
      new Request(`http://localhost/api/staff/${teacher.id}/deactivate`, { method: "PATCH" }),
      { params: { id: String(teacher.id) } }
    );

    const request = new Request(`http://localhost/api/staff/${teacher.id}/activate`, { method: "PATCH" });
    const response = await activateStaffRoute(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: teacher.id } });
    expect(updated?.status).toBe("active");
  });

  it("returns 404 activating a cross-school staff id", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherStaff = await prisma.user.create({
      data: { phone: "+15559991003", role: "teacher", name: "Cross Tenant", schoolId: otherSchool.id },
    });

    const request = new Request(`http://localhost/api/staff/${otherStaff.id}/activate`, { method: "PATCH" });
    const response = await activateStaffRoute(request, { params: { id: String(otherStaff.id) } });
    expect(response.status).toBe(404);
  });
});
