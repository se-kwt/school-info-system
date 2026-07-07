import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getStaff, POST as postStaff } from "../src/app/api/staff/route";

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

    const getResponse = await getStaff();
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
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 7", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: "New Teacher",
        phone: "+15559990002",
        role: "teacher",
        classId: klass.id,
        subject: "Science",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(201);

    const classTeacherRow = await prisma.classTeacher.findFirst({
      where: { classId: klass.id, subject: "Science" },
    });
    expect(classTeacherRow).not.toBeNull();

    const getResponse = await getStaff();
    const list = await getResponse.json();
    const teacher = list.find((entry: { role: string }) => entry.role === "teacher");
    expect(teacher.classAssignment).toEqual({
      className: "Grade 7",
      section: "A",
      subject: "Science",
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
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 8", section: "A" },
    });

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

    const getResponse = await getStaff();
    expect(getResponse.status).toBe(403);
  });

  it("rejects a classId belonging to a different school with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: "Cross Tenant Teacher",
        phone: "+15559990099",
        role: "teacher",
        classId: otherClass.id,
        subject: "Math",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(400);
  });
});
