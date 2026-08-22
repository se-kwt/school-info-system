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
import { GET as getExams, POST as postExams } from "../src/app/api/exams/route";

describe("/api/exams", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates an exam and lists it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const admin = await prisma.user.create({
      data: { phone: "+15550061111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const postRequest = new Request("http://localhost/api/exams", {
      method: "POST",
      body: JSON.stringify({ name: "Mid-term", term: "Term 1", examDate: "2026-09-01", maxMarks: 100, passMarks: 40 }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postExams(postRequest);
    expect(postResponse.status).toBe(200);
    const created = await postResponse.json();
    expect(created.id).toBeTypeOf("number");

    const getRequest = new Request("http://localhost/api/exams");
    const getResponse = await getExams(getRequest);
    expect(getResponse.status).toBe(200);
    const body = await getResponse.json();
    expect(body.exams).toEqual([
      { id: created.id, name: "Mid-term", term: "Term 1", examDate: "2026-09-01", academicYearId: year.id },
    ]);
  });

  it("lists only the active year's exams, not a stale year's", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const staleYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2024-25",
        startDate: new Date("2024-04-01"),
        endDate: new Date("2025-03-31"),
        status: "archived",
      },
    });
    await prisma.exam.create({
      data: {
        schoolId: school.id,
        academicYearId: staleYear.id,
        name: "Old Midterm",
        term: "Term 1",
        examDate: new Date("2024-09-01"),
        maxMarks: 100,
        passMarks: 40,
      },
    });
    await prisma.exam.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Current Midterm",
        term: "Term 1",
        examDate: new Date("2026-09-01"),
        maxMarks: 100,
        passMarks: 40,
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550066666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/exams");
    const response = await getExams(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.exams.map((e: { name: string }) => e.name)).toEqual(["Current Midterm"]);
  });

  it("rejects GET when there is no active academic year", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550067777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/exams");
    const response = await getExams(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing field with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    const admin = await prisma.user.create({
      data: { phone: "+15550062222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/exams", {
      method: "POST",
      body: JSON.stringify({ name: "Mid-term", term: "Term 1" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postExams(request);
    expect(response.status).toBe(400);
  });

  it("rejects a non-positive maxMarks with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    const admin = await prisma.user.create({
      data: { phone: "+15550068888", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/exams", {
      method: "POST",
      body: JSON.stringify({ name: "Mid-term", term: "Term 1", examDate: "2026-09-01", maxMarks: 0, passMarks: 0 }),
      headers: { "content-type": "application/json" },
    });
    const response = await postExams(request);
    expect(response.status).toBe(400);
  });

  it("rejects a passMarks that exceeds maxMarks with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    const admin = await prisma.user.create({
      data: { phone: "+15550069999", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/exams", {
      method: "POST",
      body: JSON.stringify({ name: "Mid-term", term: "Term 1", examDate: "2026-09-01", maxMarks: 50, passMarks: 80 }),
      headers: { "content-type": "application/json" },
    });
    const response = await postExams(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher attempting to POST with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550063333", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/exams", {
      method: "POST",
      body: JSON.stringify({ name: "Mid-term", term: "Term 1", examDate: "2026-09-01", maxMarks: 100, passMarks: 40 }),
      headers: { "content-type": "application/json" },
    });
    const response = await postExams(request);
    expect(response.status).toBe(403);
  });

  it("allows a teacher to GET the exam list", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const teacher = await prisma.user.create({
      data: { phone: "+15550064444", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.exam.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Final",
        term: "Term 2",
        examDate: new Date("2026-12-01"),
        maxMarks: 100,
        passMarks: 40,
      },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/exams");
    const response = await getExams(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.exams).toHaveLength(1);
  });

  it("only lists exams belonging to the caller's school", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    await prisma.exam.create({
      data: {
        schoolId: otherSchool.id,
        academicYearId: otherYear.id,
        name: "Other Exam",
        term: "Term 1",
        examDate: new Date("2026-09-01"),
        maxMarks: 100,
        passMarks: 40,
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550065555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/exams");
    const response = await getExams(request);
    const body = await response.json();
    expect(body.exams).toHaveLength(0);
  });
});
