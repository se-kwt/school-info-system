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
import { PATCH as patchAcademicYear } from "../src/app/api/academic-years/[id]/route";
import { activateAcademicYear, archiveAcademicYear, getActiveAcademicYear } from "../src/lib/academic-years";

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

  it("refuses a second active year for the same school at the database level", async () => {
    const school = await prisma.school.create({ data: { name: "Constraint School" } });
    await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2027-03-31"),
        status: "active",
      },
    });

    await expect(
      prisma.academicYear.create({
        data: {
          schoolId: school.id,
          name: "2027-28",
          startDate: new Date("2027-04-01"),
          endDate: new Date("2028-03-31"),
          status: "active",
        },
      })
    ).rejects.toThrow();
  });

  it("allows two active years in different schools", async () => {
    const schoolA = await prisma.school.create({ data: { name: "School A" } });
    const schoolB = await prisma.school.create({ data: { name: "School B" } });

    await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: "2026-27",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2027-03-31"),
        status: "active",
      },
    });

    const second = await prisma.academicYear.create({
      data: {
        schoolId: schoolB.id,
        name: "2026-27",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2027-03-31"),
        status: "active",
      },
    });

    expect(second.status).toBe("active");
  });

  it("allows many upcoming and archived years in one school", async () => {
    const school = await prisma.school.create({ data: { name: "Many Years School" } });
    await prisma.academicYear.createMany({
      data: [
        { schoolId: school.id, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
        { schoolId: school.id, name: "2025-26", startDate: new Date("2025-04-01"), endDate: new Date("2026-03-31"), status: "archived" },
        { schoolId: school.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
        { schoolId: school.id, name: "2028-29", startDate: new Date("2028-04-01"), endDate: new Date("2029-03-31"), status: "upcoming" },
      ],
    });

    const count = await prisma.academicYear.count({ where: { schoolId: school.id } });
    expect(count).toBe(4);
  });

  it("activates an upcoming year and archives the previously active one", async () => {
    const school = await prisma.school.create({ data: { name: "Rollover School" } });
    const current = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });
    const next = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
    });

    const result = await activateAcademicYear(prisma, {
      academicYearId: next.id,
      schoolId: school.id,
    });

    expect(result).toEqual({ ok: true });
    expect((await prisma.academicYear.findUnique({ where: { id: next.id } }))?.status).toBe("active");
    expect((await prisma.academicYear.findUnique({ where: { id: current.id } }))?.status).toBe("archived");
  });

  it("activates the first year of a school that has none active", async () => {
    const school = await prisma.school.create({ data: { name: "Fresh School" } });
    const only = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "upcoming" },
    });

    const result = await activateAcademicYear(prisma, {
      academicYearId: only.id,
      schoolId: school.id,
    });

    expect(result).toEqual({ ok: true });
    const active = await getActiveAcademicYear(prisma, school.id);
    expect(active?.id).toBe(only.id);
  });

  it("refuses to activate a year belonging to another school", async () => {
    const schoolA = await prisma.school.create({ data: { name: "School A" } });
    const schoolB = await prisma.school.create({ data: { name: "School B" } });
    const foreign = await prisma.academicYear.create({
      data: { schoolId: schoolB.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "upcoming" },
    });

    const result = await activateAcademicYear(prisma, {
      academicYearId: foreign.id,
      schoolId: schoolA.id,
    });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await prisma.academicYear.findUnique({ where: { id: foreign.id } }))?.status).toBe("upcoming");
  });

  it("refuses to re-activate an archived year", async () => {
    const school = await prisma.school.create({ data: { name: "Archive School" } });
    const old = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
    });

    const result = await activateAcademicYear(prisma, {
      academicYearId: old.id,
      schoolId: school.id,
    });

    expect(result).toEqual({ ok: false, error: "ALREADY_ARCHIVED" });
  });

  it("refuses to archive the only active year", async () => {
    const school = await prisma.school.create({ data: { name: "Sole Year School" } });
    const only = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });

    const result = await archiveAcademicYear(prisma, {
      academicYearId: only.id,
      schoolId: school.id,
    });

    expect(result).toEqual({ ok: false, error: "LAST_ACTIVE_YEAR" });
    expect((await prisma.academicYear.findUnique({ where: { id: only.id } }))?.status).toBe("active");
  });

  it("archives an upcoming year without touching the active one", async () => {
    const school = await prisma.school.create({ data: { name: "Cancel School" } });
    const current = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });
    const cancelled = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
    });

    const result = await archiveAcademicYear(prisma, {
      academicYearId: cancelled.id,
      schoolId: school.id,
    });

    expect(result).toEqual({ ok: true });
    expect((await prisma.academicYear.findUnique({ where: { id: cancelled.id } }))?.status).toBe("archived");
    expect((await prisma.academicYear.findUnique({ where: { id: current.id } }))?.status).toBe("active");
  });

  it("PATCH activates a year for an admin", async () => {
    const school = await prisma.school.create({ data: { name: "Patch School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550098888", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const current = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });
    const next = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
    });
    loginAs(admin.id, "admin", school.id);

    const response = await patchAcademicYear(
      new Request("http://test/api/academic-years/" + next.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      }),
      { params: Promise.resolve({ id: String(next.id) }) }
    );

    expect(response.status).toBe(200);
    expect((await prisma.academicYear.findUnique({ where: { id: next.id } }))?.status).toBe("active");
  });

  it("PATCH rejects a non-admin", async () => {
    const school = await prisma.school.create({ data: { name: "Role School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550099999", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const year = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "upcoming" },
    });
    loginAs(teacher.id, "teacher", school.id);

    const response = await patchAcademicYear(
      new Request("http://test/api/academic-years/" + year.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      }),
      { params: Promise.resolve({ id: String(year.id) }) }
    );

    expect(response.status).toBe(403);
  });

  it("PATCH rejects an unknown action", async () => {
    const school = await prisma.school.create({ data: { name: "Action School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550011111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const year = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "upcoming" },
    });
    loginAs(admin.id, "admin", school.id);

    const response = await patchAcademicYear(
      new Request("http://test/api/academic-years/" + year.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      }),
      { params: Promise.resolve({ id: String(year.id) }) }
    );

    expect(response.status).toBe(400);
  });

  it("PATCH refuses to archive the only active year", async () => {
    const school = await prisma.school.create({ data: { name: "Only Year School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550012222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const only = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });
    loginAs(admin.id, "admin", school.id);

    const response = await patchAcademicYear(
      new Request("http://test/api/academic-years/" + only.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      }),
      { params: Promise.resolve({ id: String(only.id) }) }
    );

    expect(response.status).toBe(400);
  });
});
