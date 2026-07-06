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
import { GET as getTimetable, POST as postTimetable } from "../src/app/api/timetable/route";

describe("/api/timetable", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedSchoolWithClassAndTeacher() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550031111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math" },
    });
    return { school, klass, teacher };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a timetable entry with a teacher assigned", async () => {
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550032222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        dayOfWeek: 1,
        period: 1,
        subject: "Math",
        teacherUserId: teacher.id,
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBeTypeOf("number");

    const created = await prisma.timetableEntry.findUnique({ where: { id: body.id } });
    expect(created).toMatchObject({
      classId: klass.id,
      dayOfWeek: 1,
      period: 1,
      subject: "Math",
      teacherUserId: teacher.id,
    });
  });

  it("creates a timetable entry with no teacher and round-trips teacherUserId as null", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550033333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const postRequest = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, period: 5, subject: "Lunch" }),
      headers: { "content-type": "application/json" },
    });
    await postTimetable(postRequest);

    const getRequest = new Request(`http://localhost/api/timetable?classId=${klass.id}`);
    const getResponse = await getTimetable(getRequest);
    const body = await getResponse.json();
    expect(body.entries[0]).toMatchObject({
      subject: "Lunch",
      teacherUserId: null,
      teacherName: null,
    });
  });

  it("rejects a missing required field with 400", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550034444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, subject: "Math" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects a classId from a different school with 400", async () => {
    const { school } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550035555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: otherClass.id, dayOfWeek: 1, period: 1, subject: "Math" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects an out-of-range dayOfWeek with 400", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550036666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 7, period: 1, subject: "Math" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacherUserId that isn't a teacher at this school with 400", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550037777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const foreignTeacher = await prisma.user.create({
      data: {
        phone: "+15550038888",
        role: "teacher",
        name: "Foreign Teacher",
        schoolId: otherSchool.id,
      },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        dayOfWeek: 1,
        period: 1,
        subject: "Math",
        teacherUserId: foreignTeacher.id,
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects a duplicate (classId, dayOfWeek, period) with 409", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550039999", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    async function create(subject: string) {
      const request = new Request("http://localhost/api/timetable", {
        method: "POST",
        body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, period: 1, subject }),
        headers: { "content-type": "application/json" },
      });
      return postTimetable(request);
    }

    const first = await create("Math");
    expect(first.status).toBe(200);
    const second = await create("Science");
    expect(second.status).toBe(409);

    const rows = await prisma.timetableEntry.findMany({ where: { classId: klass.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe("Math");
  });

  it("rejects a teacher attempting to POST with 403", async () => {
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, period: 1, subject: "Math" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(403);
  });

  it("lists entries sorted by day then period", async () => {
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    await prisma.timetableEntry.create({
      data: { classId: klass.id, dayOfWeek: 2, period: 1, subject: "Science", teacherUserId: teacher.id },
    });
    await prisma.timetableEntry.create({
      data: { classId: klass.id, dayOfWeek: 1, period: 3, subject: "English" },
    });
    await prisma.timetableEntry.create({
      data: { classId: klass.id, dayOfWeek: 1, period: 1, subject: "Math", teacherUserId: teacher.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/timetable?classId=${klass.id}`);
    const response = await getTimetable(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries.map((e: { dayOfWeek: number; period: number }) => [e.dayOfWeek, e.period])).toEqual([
      [1, 1],
      [1, 3],
      [2, 1],
    ]);
    expect(body.entries[0].teacherName).toBe("Test Teacher");
  });

  it("rejects a teacher listing a class they don't teach with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550040000", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/timetable?classId=${klass.id}`);
    const response = await getTimetable(request);
    expect(response.status).toBe(403);
  });

  it("allows admin to list any class in their school", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550041111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/timetable?classId=${klass.id}`);
    const response = await getTimetable(request);
    expect(response.status).toBe(200);
  });

  it("rejects a classId from a different school on GET with 400", async () => {
    const { school } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550042222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/timetable?classId=${otherClass.id}`);
    const response = await getTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing classId with 400", async () => {
    const { school, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/timetable");
    const response = await getTimetable(request);
    expect(response.status).toBe(400);
  });
});
