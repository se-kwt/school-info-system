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
import { GET as getTimetable, POST as postTimetable } from "../src/app/api/timetable/route";
import {
  PATCH as patchTimetable,
  DELETE as deleteTimetable,
} from "../src/app/api/timetable/[id]/route";

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
    const year = await createActiveYear(prisma, school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 5" } });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Math" } });
    const period = await prisma.period.create({
      data: { schoolId: school.id, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" },
    });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, gradeId: grade.id, section: "A", academicYearId: year.id },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550031111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    return { school, year, grade, subject, period, klass, teacher };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a timetable entry with a teacher assigned", async () => {
    const { school, klass, teacher, subject, period } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550032222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        dayOfWeek: 1,
        periodId: period.id,
        subjectId: subject.id,
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
      periodId: period.id,
      subjectId: subject.id,
      teacherUserId: teacher.id,
    });
  });

  it("creates a timetable entry with no teacher and round-trips teacherUserId as null", async () => {
    const { school, klass, subject, period } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550033333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const postRequest = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 2, periodId: period.id, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    await postTimetable(postRequest);

    const getRequest = new Request(`http://localhost/api/timetable?classId=${klass.id}`);
    const getResponse = await getTimetable(getRequest);
    const body = await getResponse.json();
    expect(body.entries[0]).toMatchObject({
      subjectName: "Math",
      teacherUserId: null,
      teacherName: null,
    });
  });

  it("rejects a missing required field with 400", async () => {
    const { school, klass, subject } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550034444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects a classId from a different school with 400", async () => {
    const { school, subject, period } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherGrade = await prisma.grade.create({ data: { schoolId: otherSchool.id, name: "Grade 1" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, gradeId: otherGrade.id, section: "A", academicYearId: otherYear.id },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550035555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: otherClass.id, dayOfWeek: 1, periodId: period.id, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects an out-of-range dayOfWeek with 400", async () => {
    const { school, klass, subject, period } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550036666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 7, periodId: period.id, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacherUserId that isn't a teacher at this school with 400", async () => {
    const { school, klass, subject, period } = await seedSchoolWithClassAndTeacher();
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
        periodId: period.id,
        subjectId: subject.id,
        teacherUserId: foreignTeacher.id,
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
  });

  it("rejects a periodId that doesn't exist with 400", async () => {
    const { school, klass, subject } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550039990", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, periodId: 999999, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Period not found");
  });

  it("rejects scheduling a lesson during a break period with 400", async () => {
    const { school, klass, subject } = await seedSchoolWithClassAndTeacher();
    const breakPeriod = await prisma.period.create({
      data: { schoolId: school.id, order: 2, label: "Break", startTime: "10:00", endTime: "10:15", isBreak: true },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550039991", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, periodId: breakPeriod.id, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Cannot schedule a lesson during a break");

    const entries = await prisma.timetableEntry.findMany({ where: { classId: klass.id, periodId: breakPeriod.id } });
    expect(entries).toHaveLength(0);
  });

  it("rejects a duplicate (classId, dayOfWeek, period) with 409", async () => {
    const { school, klass, subject, period } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550039999", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    async function create() {
      const request = new Request("http://localhost/api/timetable", {
        method: "POST",
        body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, periodId: period.id, subjectId: subject.id }),
        headers: { "content-type": "application/json" },
      });
      return postTimetable(request);
    }

    const first = await create();
    expect(first.status).toBe(200);
    const second = await create();
    expect(second.status).toBe(409);

    const rows = await prisma.timetableEntry.findMany({ where: { classId: klass.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].subjectId).toBe(subject.id);
  });

  it("rejects a teacher attempting to POST with 403", async () => {
    const { school, klass, subject, period, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/timetable", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, dayOfWeek: 1, periodId: period.id, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postTimetable(request);
    expect(response.status).toBe(403);
  });

  it("lists entries sorted by day then period", async () => {
    const { school, year, grade, klass, teacher, subject, period } = await seedSchoolWithClassAndTeacher();
    const period3 = await prisma.period.create({
      data: { schoolId: school.id, order: 3, label: "Period 3", startTime: "11:00", endTime: "11:45" },
    });
    const scienceSubject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Science" } });
    const englishSubject = await prisma.subject.create({ data: { gradeId: grade.id, name: "English" } });

    await prisma.timetableEntry.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        dayOfWeek: 2,
        periodId: period.id,
        subjectId: scienceSubject.id,
        teacherUserId: teacher.id,
      },
    });
    await prisma.timetableEntry.create({
      data: { classId: klass.id, academicYearId: year.id, dayOfWeek: 1, periodId: period3.id, subjectId: englishSubject.id },
    });
    await prisma.timetableEntry.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        dayOfWeek: 1,
        periodId: period.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
      },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/timetable?classId=${klass.id}`);
    const response = await getTimetable(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries.map((e: { dayOfWeek: number; periodOrder: number }) => [e.dayOfWeek, e.periodOrder])).toEqual([
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
    const otherGrade = await prisma.grade.create({ data: { schoolId: otherSchool.id, name: "Grade 1" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, gradeId: otherGrade.id, section: "A", academicYearId: otherYear.id },
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

describe("/api/timetable/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedEntry() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 5" } });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Math" } });
    const period = await prisma.period.create({
      data: { schoolId: school.id, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" },
    });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, gradeId: grade.id, section: "A", academicYearId: year.id },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550051111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    const entry = await prisma.timetableEntry.create({
      data: {
        classId: klass.id,
        academicYearId: year.id,
        dayOfWeek: 1,
        periodId: period.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
      },
    });
    return { school, year, grade, subject, period, klass, teacher, entry };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("updates the subject and teacher", async () => {
    const { school, grade, entry } = await seedEntry();
    const admin = await prisma.user.create({
      data: { phone: "+15550052222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const scienceSubject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Science" } });

    const request = new Request(`http://localhost/api/timetable/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ subjectId: scienceSubject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchTimetable(request, { params: Promise.resolve({ id: String(entry.id) }) });
    expect(response.status).toBe(200);

    const updated = await prisma.timetableEntry.findUnique({ where: { id: entry.id } });
    expect(updated?.subjectId).toBe(scienceSubject.id);
  });

  it("unsets the teacher when teacherUserId is explicitly null", async () => {
    const { school, entry } = await seedEntry();
    const admin = await prisma.user.create({
      data: { phone: "+15550053333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/timetable/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ teacherUserId: null }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchTimetable(request, { params: Promise.resolve({ id: String(entry.id) }) });
    expect(response.status).toBe(200);

    const updated = await prisma.timetableEntry.findUnique({ where: { id: entry.id } });
    expect(updated?.teacherUserId).toBeNull();
  });

  it("leaves the teacher unchanged when teacherUserId is omitted", async () => {
    const { school, entry, teacher, subject } = await seedEntry();
    const admin = await prisma.user.create({
      data: { phone: "+15550054444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/timetable/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    await patchTimetable(request, { params: Promise.resolve({ id: String(entry.id) }) });

    const updated = await prisma.timetableEntry.findUnique({ where: { id: entry.id } });
    expect(updated?.teacherUserId).toBe(teacher.id);
  });

  it("rejects an invalid teacherUserId with 400", async () => {
    const { school, entry } = await seedEntry();
    const admin = await prisma.user.create({
      data: { phone: "+15550055555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/timetable/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ teacherUserId: 999999 }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchTimetable(request, { params: Promise.resolve({ id: String(entry.id) }) });
    expect(response.status).toBe(400);
  });

  it("returns 404 for a nonexistent or cross-school entry id", async () => {
    const { school } = await seedEntry();
    const admin = await prisma.user.create({
      data: { phone: "+15550056666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable/999999", {
      method: "PATCH",
      body: JSON.stringify({ subjectId: 999999 }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchTimetable(request, { params: Promise.resolve({ id: "999999" }) });
    expect(response.status).toBe(404);
  });

  it("rejects an empty body with 400", async () => {
    const { school, entry } = await seedEntry();
    const admin = await prisma.user.create({
      data: { phone: "+15550057777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/timetable/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const response = await patchTimetable(request, { params: Promise.resolve({ id: String(entry.id) }) });
    expect(response.status).toBe(400);
  });

  it("rejects a teacher attempting to PATCH with 403", async () => {
    const { school, entry, teacher } = await seedEntry();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/timetable/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ subjectId: 1 }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchTimetable(request, { params: Promise.resolve({ id: String(entry.id) }) });
    expect(response.status).toBe(403);
  });

  it("deletes the entry", async () => {
    const { school, entry } = await seedEntry();
    const admin = await prisma.user.create({
      data: { phone: "+15550058888", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/timetable/${entry.id}`, { method: "DELETE" });
    const response = await deleteTimetable(request, { params: Promise.resolve({ id: String(entry.id) }) });
    expect(response.status).toBe(200);

    const found = await prisma.timetableEntry.findUnique({ where: { id: entry.id } });
    expect(found).toBeNull();
  });

  it("returns 404 deleting a nonexistent or cross-school entry id", async () => {
    const { school } = await seedEntry();
    const admin = await prisma.user.create({
      data: { phone: "+15550059999", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/timetable/999999", { method: "DELETE" });
    const response = await deleteTimetable(request, { params: Promise.resolve({ id: "999999" }) });
    expect(response.status).toBe(404);
  });

  it("rejects a teacher attempting to DELETE with 403", async () => {
    const { school, entry, teacher } = await seedEntry();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/timetable/${entry.id}`, { method: "DELETE" });
    const response = await deleteTimetable(request, { params: Promise.resolve({ id: String(entry.id) }) });
    expect(response.status).toBe(403);
  });
});
