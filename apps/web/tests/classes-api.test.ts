import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createEnrolledStudent } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getClasses, POST as postClasses } from "../src/app/api/classes/route";
import { PATCH as patchClass, DELETE as deleteClassRoute } from "../src/app/api/classes/[id]/route";
import { PATCH as archiveClassRoute } from "../src/app/api/classes/[id]/archive/route";

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

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6", section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(201);
    const created = await postResponse.json();
    expect(created).toMatchObject({ name: "Grade 6", section: "B" });

    const getResponse = await getClasses(new Request("http://localhost/api/classes"));
    expect(getResponse.status).toBe(200);
    const list = await getResponse.json();
    expect(list).toEqual([{ id: created.id, name: "Grade 6", section: "B", archived: false }]);
  });

  it("rejects a duplicate name+section with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    await prisma.class.create({ data: { schoolId: school.id, name: "Grade 6", section: "B" } });

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6", section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a missing field with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6" }),
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
    const active = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });
    await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 10", section: "A", archived: true },
    });

    const defaultResponse = await getClasses(new Request("http://localhost/api/classes"));
    const defaultList = await defaultResponse.json();
    expect(defaultList).toEqual([{ id: active.id, name: "Grade 9", section: "A", archived: false }]);

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

  it("edits a class's name and section", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Grade 9", section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchClass(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(updated?.section).toBe("B");
  });

  it("rejects an edit that collides with another class's name+section", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    await prisma.class.create({ data: { schoolId: school.id, name: "Grade 9", section: "B" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, {
      method: "PATCH",
      body: JSON.stringify({ section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchClass(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(409);
  });

  it("deletes a class with zero history", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, { method: "DELETE" });
    const response = await deleteClassRoute(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(200);

    const found = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(found).toBeNull();
  });

  it("rejects deleting a class with an enrollment, offering deletable: false", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-CLS-1",
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, { method: "DELETE" });
    const response = await deleteClassRoute(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.deletable).toBe(false);

    const stillExists = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(stillExists).not.toBeNull();
  });

  it("archives a class", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}/archive`, { method: "PATCH" });
    const response = await archiveClassRoute(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(updated?.archived).toBe(true);
  });

  it("returns 404 for a cross-school class id on PATCH/DELETE/archive", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });

    const patchResponse = await patchClass(
      new Request(`http://localhost/api/classes/${otherClass.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Hijack" }),
        headers: { "content-type": "application/json" },
      }),
      { params: { id: String(otherClass.id) } }
    );
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await deleteClassRoute(
      new Request(`http://localhost/api/classes/${otherClass.id}`, { method: "DELETE" }),
      { params: { id: String(otherClass.id) } }
    );
    expect(deleteResponse.status).toBe(404);

    const archiveResponse = await archiveClassRoute(
      new Request(`http://localhost/api/classes/${otherClass.id}/archive`, { method: "PATCH" }),
      { params: { id: String(otherClass.id) } }
    );
    expect(archiveResponse.status).toBe(404);
  });
});
