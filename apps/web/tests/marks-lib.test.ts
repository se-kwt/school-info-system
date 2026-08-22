import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear } from "./helpers/enrollment";
import { getMarksForClassExam, enterMarks } from "../src/lib/marks";
import { createExam } from "../src/lib/exams";

describe("marks lib subjectId", () => {
  let schoolId: number;
  let classId: number;
  let subjectId: number;
  let teacherId: number;
  let adminId: number;
  let yearId: number;
  let examId: number;
  let studentId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const teacher = await prisma.user.create({ data: { schoolId, phone: "+10000000001", role: "teacher", name: "Teacher One" } });
    teacherId = teacher.id;
    const admin = await prisma.user.create({ data: { schoolId, phone: "+10000000009", role: "admin", name: "Admin One" } });
    adminId = admin.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Mathematics" } });
    subjectId = subject.id;
    const year = await createActiveYear(prisma, schoolId);
    yearId = year.id;
    const klass = await prisma.class.create({ data: { schoolId, section: "A", gradeId: grade.id, academicYearId: year.id } });
    classId = klass.id;
    await prisma.classTeacher.create({ data: { classId, subjectId, teacherUserId: teacherId, academicYearId: yearId } });
    const exam = await prisma.exam.create({ data: { schoolId, academicYearId: yearId, name: "Midterm", term: "T1", examDate: new Date() } });
    examId = exam.id;
    const student = await prisma.student.create({ data: { schoolId, name: "Student One", dob: new Date("2015-01-01"), admissionNo: "A1" } });
    studentId = student.id;
    await prisma.enrollment.create({ data: { studentId, classId, academicYearId: yearId } });
  });

  it("enters marks with a subjectId and reads them back keyed by subjectId", async () => {
    const result = await enterMarks(prisma, {
      classId, examId, subjectId, maxMarks: 100, teacherUserId: teacherId, schoolId, academicYearId: yearId,
      entries: [{ studentId, marksObtained: 90 }],
    });
    expect(result).toEqual({ ok: true });

    const marks = await getMarksForClassExam(prisma, { classId, examId, schoolId, academicYearId: yearId, role: "admin", userId: 0 });
    if (!marks.ok) throw new Error("expected ok");
    expect(marks.subjects).toEqual([{ id: subjectId, name: "Mathematics" }]);
    expect(marks.students[0].marks[subjectId]).toEqual({ marksObtained: 90, maxMarks: 100, grade: "A" });
  });

  it("rejects a teacher not assigned to that subject on the class", async () => {
    const otherTeacher = await prisma.user.create({ data: { schoolId, phone: "+10000000002", role: "teacher", name: "Teacher Two" } });
    const result = await enterMarks(prisma, {
      classId, examId, subjectId, maxMarks: 100, teacherUserId: otherTeacher.id, schoolId, academicYearId: yearId,
      entries: [{ studentId, marksObtained: 90 }],
    });
    expect(result).toEqual({ ok: false, error: "NOT_ASSIGNED" });
  });

  it("refuses to read marks for an exam from another year", async () => {
    const staleYear = await prisma.academicYear.create({
      data: { schoolId, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
    });
    const stale = await createExam(prisma, schoolId, staleYear.id, { name: "Old Midterm", term: "Term 1", examDate: "2024-09-01" });

    const result = await getMarksForClassExam(prisma, {
      classId,
      examId: stale.id,
      schoolId,
      academicYearId: yearId,
      role: "admin",
      userId: adminId,
    });

    expect(result).toEqual({ ok: false, error: "INVALID_EXAM" });
  });

  it("refuses to enter marks against an exam from another year", async () => {
    const staleYear = await prisma.academicYear.create({
      data: { schoolId, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
    });
    const stale = await createExam(prisma, schoolId, staleYear.id, { name: "Old Midterm", term: "Term 1", examDate: "2024-09-01" });

    const result = await enterMarks(prisma, {
      classId,
      examId: stale.id,
      subjectId,
      maxMarks: 100,
      teacherUserId: teacherId,
      schoolId,
      academicYearId: yearId,
      entries: [{ studentId, marksObtained: 80 }],
    });

    expect(result).toEqual({ ok: false, error: "INVALID_EXAM" });
    expect(await prisma.mark.count({ where: { examId: stale.id } })).toBe(0);
  });
});
