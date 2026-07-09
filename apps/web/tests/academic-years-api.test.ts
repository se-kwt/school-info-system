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
import { GET as getAcademicYears, POST as postAcademicYears } from "../src/app/api/academic-years/route";

describe("/api/academic-years", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  function loginAs(userId: number, role: "admin" | "teacher" | "accountant", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates an academic year as upcoming and lists it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550091111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const postRequest = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "2026-27", startDate: "2026-06-01", endDate: "2027-04-30" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postAcademicYears(postRequest);
    expect(postResponse.status).toBe(200);
    const created = await postResponse.json();
    expect(created.id).toBeTypeOf("number");

    const stored = await prisma.academicYear.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe("upcoming");

    const getResponse = await getAcademicYears();
    const body = await getResponse.json();
    expect(body.academicYears).toEqual([
      { id: created.id, name: "2026-27", startDate: "2026-06-01", endDate: "2027-04-30", status: "upcoming" },
    ]);
  });

  it("rejects startDate on or after endDate with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550092222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "Bad Year", startDate: "2027-01-01", endDate: "2026-01-01" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAcademicYears(request);
    expect(response.status).toBe(400);
  });

  it("rejects a duplicate name for the same school with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550093333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "2026-27", startDate: "2026-07-01", endDate: "2027-05-01" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAcademicYears(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing field with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550094444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "2026-27", startDate: "2026-06-01" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAcademicYears(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher attempting to POST with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550095555", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "2026-27", startDate: "2026-06-01", endDate: "2027-04-30" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAcademicYears(request);
    expect(response.status).toBe(403);
  });

  it("allows a teacher to GET the list", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550096666", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const response = await getAcademicYears();
    expect(response.status).toBe(200);
  });

  it("only lists academic years belonging to the caller's school", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    await prisma.academicYear.create({
      data: {
        schoolId: otherSchool.id,
        name: "2025-26",
        startDate: new Date("2025-06-01"),
        endDate: new Date("2026-04-30"),
        status: "archived",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550097777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const response = await getAcademicYears();
    const body = await response.json();
    expect(body.academicYears).toEqual([]);
  });
});
