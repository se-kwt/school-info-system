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
import { GET as getAttendance, POST as postAttendance } from "../src/app/api/attendance/route";

describe("/api/attendance", () => {
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
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550001111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math", academicYearId: year.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-500",
    });
    return { school, year, klass, teacher, student };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("returns the roster with null status and 0% for an unmarked day", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.students).toEqual([
      { studentId: student.id, name: "Test Student", status: null, note: null, monthPercent: 0 },
    ]);
  });

  it("rejects a teacher viewing a class they don't teach with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550002222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    expect(response.status).toBe(403);
  });

  it("allows admin to view any class in their school", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550003333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.students[0].studentId).toBe(student.id);
  });

  it("rejects a classId from a different school with 400", async () => {
    const { school, teacher } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550004444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${otherClass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing date with 400", async () => {
    const { school, year, klass, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/attendance?classId=${klass.id}`);
    const response = await getAttendance(request);
    expect(response.status).toBe(400);
  });

  it("creates attendance records for a fresh mark", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record).toMatchObject({ status: "present", markedById: teacher.id });
  });

  it("upserts (re-marks) the same class+date without creating a duplicate row", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    async function mark(status: string) {
      const request = new Request("http://localhost/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          classId: klass.id,
          date: "2026-07-06",
          entries: [{ studentId: student.id, status }],
        }),
        headers: { "content-type": "application/json" },
      });
      return postAttendance(request);
    }

    await mark("present");
    const secondResponse = await mark("absent");
    expect(secondResponse.status).toBe(200);

    const records = await prisma.attendance.findMany({ where: { studentId: student.id } });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("absent");
  });

  it("rejects a studentId that doesn't belong to the class with 400", async () => {
    const { school, year, klass, teacher } = await seedSchoolWithClassAndTeacher();
    const otherClass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 6", section: "B" },
    });
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: otherClass.id,
      academicYearId: year.id,
      name: "Other Student",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-501",
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
        entries: [{ studentId: otherStudent.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(400);

    const records = await prisma.attendance.findMany({ where: { studentId: otherStudent.id } });
    expect(records).toHaveLength(0);
  });

  it("rejects a teacher marking a class they don't own with 403", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550005555", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);
  });

  it("rejects an admin attempting to POST with 403", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550006666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);
  });

  it("computes an 80% monthly percentage from 4 attended out of 5 marked days", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const statuses: Array<"present" | "absent" | "late"> = [
      "present",
      "present",
      "present",
      "absent",
      "late",
    ];
    for (let day = 1; day <= statuses.length; day += 1) {
      await prisma.attendance.create({
        data: {
          studentId: student.id,
          date: new Date(`2026-07-0${day}`),
          status: statuses[day - 1],
          markedById: teacher.id,
        },
      });
    }
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    const body = await response.json();
    expect(body.students[0].monthPercent).toBe(80);
  });

  it("excludes attendance from a different month when computing monthPercent for a date on the 1st", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();

    // Two days in the previous month, both "absent" -- must NOT count toward July's percentage.
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        date: new Date(Date.UTC(2026, 5, 29)), // June 29, 2026
        status: "absent",
        markedById: teacher.id,
      },
    });
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        date: new Date(Date.UTC(2026, 5, 30)), // June 30, 2026
        status: "absent",
        markedById: teacher.id,
      },
    });
    // One day in July, "present" -- should be the ONLY day counted for July's percentage.
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        date: new Date(Date.UTC(2026, 6, 1)), // July 1, 2026
        status: "present",
        markedById: teacher.id,
      },
    });

    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-01`
    );
    const response = await getAttendance(request);
    const body = await response.json();

    // If June's 2 absent days leaked into July's window, this would be far below 100.
    expect(body.students[0].monthPercent).toBe(100);
  });
});
