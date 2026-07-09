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
        rollNumber: "1",
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
        rollNumber: "1",
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
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Existing Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: klass.section,
        admissionNo: "SCH-003",
        rollNumber: "1",
      },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Duplicate",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-003",
        rollNumber: "2",
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
        rollNumber: "1",
        parentPhone: teacher.phone,
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a new parentPhone with no parentName with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
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
        rollNumber: "1",
        parentPhone: "+15558880005",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects a classId belonging to a different school with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
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
        rollNumber: "1",
        parentPhone: "+15558889999",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects a missing rollNumber with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 8", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "No Roll Number",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-006",
        parentPhone: "+15558880006",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects a duplicate rollNumber within the same class with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });
    await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "First Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-007",
        rollNumber: "5",
      },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Second Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-008",
        rollNumber: "5",
        parentPhone: "+15558880007",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("allows the same rollNumber in two different classes", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const classOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 10", section: "A" },
    });
    const classTwo = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 11", section: "A" },
    });
    await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "First Student",
        dob: new Date("2016-01-01"),
        classId: classOne.id,
        section: "A",
        admissionNo: "SCH-009",
        rollNumber: "5",
      },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Second Student",
        dob: "2016-01-01",
        classId: classTwo.id,
        admissionNo: "SCH-010",
        rollNumber: "5",
        parentPhone: "+15558880008",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);
  });
});
