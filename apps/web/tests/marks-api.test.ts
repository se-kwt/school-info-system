import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createEnrolledStudent, createClass } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getMarks, POST as postMarks } from "../src/app/api/marks/route";

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
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550071111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-700",
    });
    const exam = await prisma.exam.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Mid-term",
        term: "Term 1",
        examDate: new Date("2026-09-01"),
        maxMarks: 100,
        passMarks: 40,
      },
    });
    return { school, year, klass, teacher, student, exam, subject };
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
    const { school, year, klass, teacher, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    await prisma.mark.create({
      data: {
        examId: exam.id,
        studentId: student.id,
        subjectId: subject.id,
        academicYearId: year.id,
        marksObtained: 95,
        maxMarks: 100,
        grade: "A",
        enteredById: teacher.id,
      },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/marks?classId=${klass.id}&examId=${exam.id}`);
    const response = await getMarks(request);
    const body = await response.json();
    expect(body.subjects).toEqual([{ id: subject.id, name: "Math" }]);
    expect(body.students[0].marks[subject.id]).toEqual({
      marksObtained: 95,
      maxMarks: 100,
      grade: "A",
      isAbsent: false,
      remarks: null,
    });
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
    const otherYear = await createActiveYear(prisma, otherSchool.id, "2026-27-other");
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
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
    const otherYear = await createActiveYear(prisma, otherSchool.id, "2026-27-other");
    const otherExam = await prisma.exam.create({
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

describe("POST /api/marks", () => {
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
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const subject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Math" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550081111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subjectId: subject.id, academicYearId: year.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-800",
    });
    const exam = await prisma.exam.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Mid-term",
        term: "Term 1",
        examDate: new Date("2026-09-01"),
        maxMarks: 100,
        passMarks: 40,
      },
    });
    return { school, year, klass, teacher, student, exam, subject };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a Mark row with the computed grade", async () => {
    const { school, klass, teacher, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: 95 }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(200);

    const mark = await prisma.mark.findFirst({ where: { studentId: student.id, subjectId: subject.id } });
    expect(mark).toMatchObject({ marksObtained: 95, maxMarks: 100, grade: "A" });
  });

  it("upserts (re-saves) without creating a duplicate row", async () => {
    const { school, klass, teacher, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    async function save(marksObtained: number) {
      const request = new Request("http://localhost/api/marks", {
        method: "POST",
        body: JSON.stringify({
          classId: klass.id,
          examId: exam.id,
          subjectId: subject.id,
          entries: [{ studentId: student.id, marksObtained }],
        }),
        headers: { "content-type": "application/json" },
      });
      return postMarks(request);
    }

    await save(95);
    const secondResponse = await save(60);
    expect(secondResponse.status).toBe(200);

    const marks = await prisma.mark.findMany({ where: { studentId: student.id, subjectId: subject.id } });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ marksObtained: 60, grade: "C" });
  });

  it("rejects a missing required field with 400", async () => {
    const { school, klass, teacher, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, examId: exam.id, subjectId: subject.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(400);
  });

  it("rejects an examId from a different school with 400", async () => {
    const { school, klass, teacher, student, subject } = await seedSchoolWithClassTeacherAndExam();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id, "2026-27-other");
    const otherExam = await prisma.exam.create({
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
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: otherExam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: 95 }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher not assigned to this class+subject with 403", async () => {
    const { school, klass, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550082222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: 95 }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(403);
  });

  it("rejects a teacher assigned to the class for a different subject with 403", async () => {
    const { school, klass, teacher, student, exam } = await seedSchoolWithClassTeacherAndExam();
    const otherSubject = await prisma.subject.create({ data: { gradeId: klass.gradeId, name: "Science" } });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: otherSubject.id,
        entries: [{ studentId: student.id, marksObtained: 95 }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(403);
  });

  it("rejects a studentId outside the class with 400, all-or-nothing", async () => {
    const { school, year, klass, teacher, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    const otherClass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 6", section: "B" });
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: otherClass.id,
      academicYearId: year.id,
      name: "Other Student",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-801",
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: otherStudent.id, marksObtained: 95 }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(400);

    const marks = await prisma.mark.findMany({ where: { studentId: otherStudent.id } });
    expect(marks).toHaveLength(0);
  });

  it("rejects marksObtained above maxMarks with 400", async () => {
    const { school, klass, teacher, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: 105 }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(400);
  });

  it("rejects a negative marksObtained with 400", async () => {
    const { school, klass, teacher, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: -5 }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(400);
  });

  it("preserves isAbsent and remarks across a save that forwards them", async () => {
    const { school, klass, teacher, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    // First save marks the student absent with a remark.
    const firstRequest = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: 0, isAbsent: true, remarks: "Sick leave" }],
      }),
      headers: { "content-type": "application/json" },
    });
    expect((await postMarks(firstRequest)).status).toBe(200);

    // Re-saving with isAbsent/remarks forwarded (as MarksView.tsx's handleSave
    // now does) must not clobber them back to false/null.
    const secondRequest = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: 0, isAbsent: true, remarks: "Sick leave" }],
      }),
      headers: { "content-type": "application/json" },
    });
    expect((await postMarks(secondRequest)).status).toBe(200);

    const mark = await prisma.mark.findFirst({ where: { studentId: student.id, subjectId: subject.id } });
    expect(mark).toMatchObject({ isAbsent: true, remarks: "Sick leave" });
  });

  it("rejects a non-boolean isAbsent with 400 instead of a Prisma 500", async () => {
    const { school, klass, teacher, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: 10, isAbsent: "no" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(400);
  });

  it("rejects an admin attempting to POST with 403", async () => {
    const { school, klass, student, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    const admin = await prisma.user.create({
      data: { phone: "+15550083333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/marks", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        examId: exam.id,
        subjectId: subject.id,
        entries: [{ studentId: student.id, marksObtained: 95 }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postMarks(request);
    expect(response.status).toBe(403);
  });

  it("computes the correct grade at each threshold boundary", async () => {
    const { school, year, klass, teacher, exam, subject } = await seedSchoolWithClassTeacherAndExam();
    loginAs(teacher.id, "teacher", school.id);

    const boundaries: Array<{ marksObtained: number; grade: string }> = [
      { marksObtained: 90, grade: "A" },
      { marksObtained: 89, grade: "B" },
      { marksObtained: 75, grade: "B" },
      { marksObtained: 74, grade: "C" },
      { marksObtained: 60, grade: "C" },
      { marksObtained: 59, grade: "D" },
      { marksObtained: 40, grade: "D" },
      { marksObtained: 39, grade: "F" },
    ];

    for (const [index, boundary] of boundaries.entries()) {
      const student = await createEnrolledStudent(prisma, {
        schoolId: school.id,
        classId: klass.id,
        academicYearId: year.id,
        name: `Boundary Student ${index}`,
        dob: new Date("2016-01-01"),
        admissionNo: `SCH-90${index}`,
      });

      const request = new Request("http://localhost/api/marks", {
        method: "POST",
        body: JSON.stringify({
          classId: klass.id,
          examId: exam.id,
          subjectId: subject.id,
          entries: [{ studentId: student.id, marksObtained: boundary.marksObtained }],
        }),
        headers: { "content-type": "application/json" },
      });
      await postMarks(request);

      const mark = await prisma.mark.findFirst({ where: { studentId: student.id } });
      expect(mark?.grade).toBe(boundary.grade);
    }
  });
});
