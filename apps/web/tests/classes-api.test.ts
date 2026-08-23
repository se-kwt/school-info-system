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
import { GET as getClasses, POST as postClasses } from "../src/app/api/classes/route";
import { PATCH as patchClass, DELETE as deleteClassRoute } from "../src/app/api/classes/[id]/route";
import { PATCH as archiveClassRoute } from "../src/app/api/classes/[id]/archive/route";
import { PATCH as unarchiveClassRoute } from "../src/app/api/classes/[id]/unarchive/route";
import { POST as postFaculty } from "../src/app/api/classes/[id]/faculty/route";

describe("/api/classes", () => {
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
      data: { phone: "+15551110000", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a class and lists it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 6" } });

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ gradeId: grade.id, section: "B", academicYearId: year.id }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(201);
    const created = await postResponse.json();
    expect(created).toMatchObject({ gradeId: grade.id, gradeName: "Grade 6", section: "B", academicYearId: year.id });

    const getResponse = await getClasses(new Request("http://localhost/api/classes"));
    expect(getResponse.status).toBe(200);
    const list = await getResponse.json();
    expect(list).toEqual([
      { id: created.id, gradeId: grade.id, gradeName: "Grade 6", section: "B", academicYearId: year.id, archived: false, capacity: null, room: null },
    ]);
  });

  it("rejects a duplicate grade+section+year with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 6" } });
    await prisma.class.create({ data: { schoolId: school.id, gradeId: grade.id, section: "B", academicYearId: year.id } });

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ gradeId: grade.id, section: "B", academicYearId: year.id }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a missing field with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 6" } });

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ gradeId: grade.id }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const getResponse = await getClasses(new Request("http://localhost/api/classes"));
    expect(getResponse.status).toBe(401);
  });

  it("rejects a non-admin role with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15552220000", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const getResponse = await getClasses(new Request("http://localhost/api/classes"));
    expect(getResponse.status).toBe(403);
  });

  it("excludes archived classes by default but includes them with includeArchived=true", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const active = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 9", section: "A" });
    const archived = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 10", section: "A" });
    await prisma.class.update({ where: { id: archived.id }, data: { archived: true } });

    const defaultResponse = await getClasses(new Request("http://localhost/api/classes"));
    const defaultList = await defaultResponse.json();
    expect(defaultList).toEqual([
      { id: active.id, gradeId: active.gradeId, gradeName: "Grade 9", section: "A", academicYearId: year.id, archived: false, capacity: null, room: null },
    ]);

    const allResponse = await getClasses(new Request("http://localhost/api/classes?includeArchived=true"));
    const allList = await allResponse.json();
    expect(allList).toHaveLength(2);
  });
});

describe("/api/classes/[id]", () => {
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
      data: { phone: "+15551110020", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("edits a class's section", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 9", section: "A" });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, {
      method: "PATCH",
      body: JSON.stringify({ section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchClass(request, { params: Promise.resolve({ id: String(klass.id) }) });
    expect(response.status).toBe(200);

    const updated = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(updated?.section).toBe("B");
  });

  it("rejects an edit that collides with another class's grade+section+year", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 9" } });
    await prisma.class.create({ data: { schoolId: school.id, gradeId: grade.id, section: "B", academicYearId: year.id } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, gradeId: grade.id, section: "A", academicYearId: year.id } });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, {
      method: "PATCH",
      body: JSON.stringify({ section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchClass(request, { params: Promise.resolve({ id: String(klass.id) }) });
    expect(response.status).toBe(409);
  });

  it("deletes a class with zero history", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 9", section: "A" });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, { method: "DELETE" });
    const response = await deleteClassRoute(request, { params: Promise.resolve({ id: String(klass.id) }) });
    expect(response.status).toBe(200);

    const found = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(found).toBeNull();
  });

  it("rejects deleting a class with an enrollment, offering deletable: false", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 9", section: "A" });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-CLS-1",
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, { method: "DELETE" });
    const response = await deleteClassRoute(request, { params: Promise.resolve({ id: String(klass.id) }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.deletable).toBe(false);

    const stillExists = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(stillExists).not.toBeNull();
  });

  it("archives a class", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 9", section: "A" });

    const request = new Request(`http://localhost/api/classes/${klass.id}/archive`, { method: "PATCH" });
    const response = await archiveClassRoute(request, { params: Promise.resolve({ id: String(klass.id) }) });
    expect(response.status).toBe(200);

    const updated = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(updated?.archived).toBe(true);
  });

  it("unarchives a class", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 9", section: "A" });
    await prisma.class.update({ where: { id: klass.id }, data: { archived: true } });

    const request = new Request(`http://localhost/api/classes/${klass.id}/unarchive`, { method: "PATCH" });
    const response = await unarchiveClassRoute(request, { params: Promise.resolve({ id: String(klass.id) }) });
    expect(response.status).toBe(200);

    const updated = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(updated?.archived).toBe(false);
  });

  it("returns 404 unarchiving a cross-school class id", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
    await prisma.class.update({ where: { id: otherClass.id }, data: { archived: true } });

    const request = new Request(`http://localhost/api/classes/${otherClass.id}/unarchive`, {
      method: "PATCH",
    });
    const response = await unarchiveClassRoute(request, { params: Promise.resolve({ id: String(otherClass.id) }) });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a cross-school class id on PATCH/DELETE/archive", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });

    const patchResponse = await patchClass(
      new Request(`http://localhost/api/classes/${otherClass.id}`, {
        method: "PATCH",
        body: JSON.stringify({ section: "Z" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: String(otherClass.id) }) }
    );
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await deleteClassRoute(
      new Request(`http://localhost/api/classes/${otherClass.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: String(otherClass.id) }) }
    );
    expect(deleteResponse.status).toBe(404);

    const archiveResponse = await archiveClassRoute(
      new Request(`http://localhost/api/classes/${otherClass.id}/archive`, { method: "PATCH" }),
      { params: Promise.resolve({ id: String(otherClass.id) }) }
    );
    expect(archiveResponse.status).toBe(404);
  });
});

describe("/api/classes/[id]/faculty", () => {
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
      data: { phone: "+15551120000", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("rejects assigning a deactivated teacher with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    const inactiveTeacher = await prisma.user.create({
      data: { phone: "+15551121111", role: "teacher", name: "Former Teacher", schoolId: school.id, status: "inactive" },
    });
    await loginAsAdmin(school.id);

    const request = new Request(`http://localhost/api/classes/${klass.id}/faculty`, {
      method: "POST",
      body: JSON.stringify({ subjectId: subject.id, teacherUserId: inactiveTeacher.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFaculty(request, { params: Promise.resolve({ id: String(klass.id) }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("That teacher is deactivated and cannot be assigned");

    const link = await prisma.classTeacher.findFirst({ where: { classId: klass.id, teacherUserId: inactiveTeacher.id } });
    expect(link).toBeNull();
  });
});
