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
import { GET as getStudents, POST as postStudents } from "../src/app/api/students/route";

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
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 3", section: "A" },
    });
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
        parentPhone: parent.phone,
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
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 4", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Another Student",
        dob: "2015-06-15",
        classId: klass.id,
        admissionNo: "SCH-002",
        parentPhone: "+15558880002",
        parentName: "Brand New Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);

    const newParent = await prisma.user.findUnique({ where: { phone: "+15558880002" } });
    expect(newParent).toMatchObject({ name: "Brand New Parent", role: "parent" });

    const getResponse = await getStudents();
    const list = await getResponse.json();
    const created = list.find((entry: { admissionNo: string }) => entry.admissionNo === "SCH-002");
    expect(created.parents).toEqual([{ name: "Brand New Parent", phone: "+15558880002" }]);
  });

  it("rejects a duplicate admission number with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
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
        parentPhone: "+15558880003",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a parentPhone belonging to a non-parent role with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 6", section: "A" },
    });
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
        parentPhone: teacher.phone,
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a new parentPhone with no parentName with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 7", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "No Parent Name",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-005",
        parentPhone: "+15558880005",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects a classId belonging to a different school with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Cross Tenant",
        dob: "2016-01-01",
        classId: otherClass.id,
        admissionNo: "SCH-999",
        parentPhone: "+15558889999",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });
});
