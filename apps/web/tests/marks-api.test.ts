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
import { GET as getMarks } from "../src/app/api/marks/route";

describe("GET /api/marks", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedSchoolWithClassTeacherAndExam() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550071111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math" },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Test Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-700",
      },
    });
    const exam = await prisma.exam.create({
      data: {
        schoolId: school.id,
        name: "Mid-term",
        term: "Term 1",
        examDate: new Date("2026-09-01"),
      },
    });
    return { school, klass, teacher, student, exam };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("returns null marks and empty subjects for a class with no marks yet", async () => {
    const { school, klass, teacher, student, exam } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/marks?classId=${klass.id}&examId=${exam.id}`);
    const response = await getMarks(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.subjects).toEqual([]);
    expect(body.students).toEqual([{ studentId: student.id, name: "Test Student", marks: {} }]);
  });

  it("returns the subject-wise breakdown with computed grade", async () => {
    const { school, klass, teacher, student, exam } = await seedSchoolWithClassTeacherAndExam();
    await prisma.mark.create({
      data: {
        examId: exam.id,
        studentId: student.id,
        subject: "Math",
        marksObtained: 95,
        maxMarks: 100,
        grade: "A",
      },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/marks?classId=${klass.id}&examId=${exam.id}`);
    const response = await getMarks(request);
    const body = await response.json();
    expect(body.subjects).toEqual(["Math"]);
    expect(body.students[0].marks.Math).toEqual({ marksObtained: 95, maxMarks: 100, grade: "A" });
  });

  it("rejects a teacher viewing a class they don't teach with 403", async () => {
    const { school, klass, exam } = await seedSchoolWithClassTeacherAndExam();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550072222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/marks?classId=${klass.id}&examId=${exam.id}`);
    const response = await getMarks(request);
    expect(response.status).toBe(403);
  });

  it("allows admin to view any class in their school", async () => {
    const { school, klass, exam } = await seedSchoolWithClassTeacherAndExam();
    const admin = await prisma.user.create({
      data: { phone: "+15550073333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/marks?classId=${klass.id}&examId=${exam.id}`);
    const response = await getMarks(request);
    expect(response.status).toBe(200);
  });

  it("rejects a classId from a different school with 400", async () => {
    const { school, exam } = await seedSchoolWithClassTeacherAndExam();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550074444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/marks?classId=${otherClass.id}&examId=${exam.id}`
    );
    const response = await getMarks(request);
    expect(response.status).toBe(400);
  });

  it("rejects an examId from a different school with 400", async () => {
    const { school, klass } = await seedSchoolWithClassTeacherAndExam();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherExam = await prisma.exam.create({
      data: {
        schoolId: otherSchool.id,
        name: "Other Exam",
        term: "Term 1",
        examDate: new Date("2026-09-01"),
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550075555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/marks?classId=${klass.id}&examId=${otherExam.id}`
    );
    const response = await getMarks(request);
    expect(response.status).toBe(400);
  });

  it("rejects missing query params with 400", async () => {
    const { school, teacher } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks");
    const response = await getMarks(request);
    expect(response.status).toBe(400);
  });
});
