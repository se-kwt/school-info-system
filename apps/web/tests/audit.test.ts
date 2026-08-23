import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear } from "./helpers/enrollment";
import { markAttendance } from "../src/lib/attendance";
import { enterMarks } from "../src/lib/marks";
import { getSchoolLocalToday } from "../src/lib/date-utils";

describe("audit trail for attendance and marks corrections", () => {
  let schoolId: number;
  let classId: number;
  let subjectId: number;
  let teacherId: number;
  let yearId: number;
  let examId: number;
  let studentId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const teacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000001", role: "teacher", name: "Teacher One" },
    });
    teacherId = teacher.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Mathematics" } });
    subjectId = subject.id;
    const year = await createActiveYear(prisma, schoolId);
    yearId = year.id;
    const klass = await prisma.class.create({
      data: { schoolId, section: "A", gradeId: grade.id, academicYearId: year.id },
    });
    classId = klass.id;
    await prisma.classTeacher.create({
      data: { classId, subjectId, teacherUserId: teacherId, academicYearId: yearId },
    });
    const exam = await prisma.exam.create({
      data: { schoolId, academicYearId: yearId, name: "Midterm", term: "T1", examDate: new Date(), maxMarks: 100, passMarks: 40 },
    });
    examId = exam.id;
    const student = await prisma.student.create({
      data: { schoolId, name: "Student One", dob: new Date("2015-01-01"), admissionNo: "A1" },
    });
    studentId = student.id;
    await prisma.enrollment.create({ data: { studentId, classId, academicYearId: yearId } });
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("records an attendance correction with the previous value", async () => {
    const today = getSchoolLocalToday();
    await markAttendance(prisma, {
      classId, date: today, academicYearId: yearId, schoolId,
      teacherUserId: teacherId, role: "teacher",
      entries: [{ studentId, status: "present" }],
    });
    await markAttendance(prisma, {
      classId, date: today, academicYearId: yearId, schoolId,
      teacherUserId: teacherId, role: "teacher",
      entries: [{ studentId, status: "absent" }],
    });

    const corrections = await prisma.recordCorrection.findMany({
      where: { entity: "attendance", studentId },
    });

    expect(corrections).toHaveLength(1);
    expect(corrections[0].fromValue).toBe("present");
    expect(corrections[0].toValue).toBe("absent");
    expect(corrections[0].actorUserId).toBe(teacherId);
  });

  it("records nothing on the first mark of a day", async () => {
    await markAttendance(prisma, {
      classId, date: getSchoolLocalToday(), academicYearId: yearId, schoolId,
      teacherUserId: teacherId, role: "teacher",
      entries: [{ studentId, status: "present" }],
    });

    expect(await prisma.recordCorrection.count()).toBe(0);
  });

  it("records nothing when the value is unchanged", async () => {
    const today = getSchoolLocalToday();
    const entries = [{ studentId, status: "present" as const }];
    await markAttendance(prisma, { classId, date: today, academicYearId: yearId, schoolId, teacherUserId: teacherId, role: "teacher", entries });
    await markAttendance(prisma, { classId, date: today, academicYearId: yearId, schoolId, teacherUserId: teacherId, role: "teacher", entries });

    expect(await prisma.recordCorrection.count()).toBe(0);
  });

  it("records a marks correction with the previous score", async () => {
    await enterMarks(prisma, { classId, examId, subjectId, teacherUserId: teacherId, schoolId, academicYearId: yearId, entries: [{ studentId, marksObtained: 70 }] });
    await enterMarks(prisma, { classId, examId, subjectId, teacherUserId: teacherId, schoolId, academicYearId: yearId, entries: [{ studentId, marksObtained: 85 }] });

    const corrections = await prisma.recordCorrection.findMany({ where: { entity: "mark", studentId } });

    expect(corrections).toHaveLength(1);
    expect(corrections[0].fromValue).toBe("70");
    expect(corrections[0].toValue).toBe("85");
  });
});
