import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createClass, createEnrolledStudent } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getAttendance, POST as postAttendance } from "../src/app/api/attendance/route";
import { getSchoolLocalToday } from "../src/lib/date-utils";

// Attendance's teacher edit-window lock is anchored to the school's local
// (IST) calendar date, not the server's UTC date -- see src/lib/date-utils.ts.
const today = getSchoolLocalToday();

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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const teacher = await prisma.user.create({
      data: { phone: "+15550001111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
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
      {
        studentId: student.id,
        name: "Test Student",
        rollNumber: null,
        photoUrl: null,
        status: null,
        note: null,
        monthPercent: 0,
      },
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
    const { school } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
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
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/attendance?classId=${klass.id}`);
    const response = await getAttendance(request);
    expect(response.status).toBe(400);
  });

  it("creates attendance records for a fresh mark on today's date", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
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
          date: today,
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

  it("preserves academicYearId when re-marking the same student+date (update branch never touches year)", async () => {
    const { school, year, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    // First mark: create the attendance record with academicYearId
    const firstRequest = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const firstResponse = await postAttendance(firstRequest);
    expect(firstResponse.status).toBe(200);

    // Verify the record was created with the correct academicYearId
    let record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record?.academicYearId).toBe(year.id);
    expect(record?.status).toBe("present");

    // Second mark: update the same record with a different status
    const secondRequest = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [{ studentId: student.id, status: "absent" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const secondResponse = await postAttendance(secondRequest);
    expect(secondResponse.status).toBe(200);

    // Verify the record was updated (not recreated) and academicYearId was NOT modified
    record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record?.academicYearId).toBe(year.id);
    expect(record?.status).toBe("absent");
  });

  it("rejects a studentId that doesn't belong to the class with 400", async () => {
    const { school, year, klass, teacher } = await seedSchoolWithClassAndTeacher();
    const otherClass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 6", section: "B" });
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
        date: today,
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
        date: today,
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);
  });

  it("rejects a teacher marking a non-today date with 403", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2020-01-01",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record).toBeNull();
  });

  it("allows admin to mark a non-today (past) date", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550006666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-01",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record?.status).toBe("present");
  });

  it("rejects an admin marking a class from a different school with 403", async () => {
    const { school } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
    const admin = await prisma.user.create({
      data: { phone: "+15550007777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: otherClass.id,
        date: today,
        entries: [{ studentId: 999999, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);
  });

  it("computes an 80% monthly percentage from 4 attended out of 5 marked days", async () => {
    const { school, year, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
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
          academicYearId: year.id,
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
    const { school, year, klass, teacher, student } = await seedSchoolWithClassAndTeacher();

    // Two days in the previous month, both "absent" -- must NOT count toward July's percentage.
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        academicYearId: year.id,
        date: new Date(Date.UTC(2026, 5, 29)), // June 29, 2026
        status: "absent",
        markedById: teacher.id,
      },
    });
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        academicYearId: year.id,
        date: new Date(Date.UTC(2026, 5, 30)), // June 30, 2026
        status: "absent",
        markedById: teacher.id,
      },
    });
    // One day in July, "present" -- should be the ONLY day counted for July's percentage.
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        academicYearId: year.id,
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

  it("weights half_day as half credit and drops excused from the denominator (75%, not 33% or 50%)", async () => {
    const { school, year, klass, teacher, student } = await seedSchoolWithClassAndTeacher();

    // 1 present, 1 half_day, 1 excused -> (1 + 0.5) / 2 marked days = 75%.
    // A naive present/late-only count would read 33% (1/3); a naive
    // present+late+halfDay-over-all-records count would read 50% (1.5/3).
    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, academicYearId: year.id, date: new Date(Date.UTC(2026, 6, 1)), status: "present", markedById: teacher.id },
        { studentId: student.id, academicYearId: year.id, date: new Date(Date.UTC(2026, 6, 2)), status: "half_day", markedById: teacher.id },
        { studentId: student.id, academicYearId: year.id, date: new Date(Date.UTC(2026, 6, 3)), status: "excused", markedById: teacher.id },
      ],
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    const body = await response.json();
    expect(body.students[0].monthPercent).toBe(75);
  });

  it("deletes an existing attendance record when the entry status is null", async () => {
    const { school, year, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    await prisma.attendance.create({
      data: { studentId: student.id, academicYearId: year.id, date: new Date(today), status: "present", markedById: teacher.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [{ studentId: student.id, status: null }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record).toBeNull();
  });

  it("is a no-op when a null-status entry has no existing record", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [{ studentId: student.id, status: null }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record).toBeNull();
  });

  it("applies a mix of present, absent, late, and null entries in a single submit", async () => {
    const { school, year, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const secondStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Second Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-502",
    });
    const thirdStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Third Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-503",
    });
    await prisma.attendance.create({
      data: { studentId: thirdStudent.id, academicYearId: year.id, date: new Date(today), status: "present", markedById: teacher.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [
          { studentId: student.id, status: "absent" },
          { studentId: secondStudent.id, status: "late" },
          { studentId: thirdStudent.id, status: null },
        ],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const records = await prisma.attendance.findMany({ where: { date: new Date(today) } });
    expect(records.find((r) => r.studentId === student.id)?.status).toBe("absent");
    expect(records.find((r) => r.studentId === secondStudent.id)?.status).toBe("late");
    expect(records.find((r) => r.studentId === thirdStudent.id)).toBeUndefined();
  });

  it("stamps the academic year onto every attendance record", async () => {
    const { school, year, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record?.academicYearId).toBe(year.id);
  });

  it("refuses an admin marking a date before the academic year starts", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550008888", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2020-01-15",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(400);

    const record = await prisma.attendance.count({ where: { studentId: student.id } });
    expect(record).toBe(0);
  });

  it("refuses an admin marking a date after the academic year ends", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550009999", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2099-01-15",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(400);
  });

  it("allows an admin marking a past date inside the academic year", async () => {
    // yearId spans 2026-06-01 to 2027-04-30 in this file's fixture
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550010101", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-06-15",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record?.status).toBe("present");
  });
});
