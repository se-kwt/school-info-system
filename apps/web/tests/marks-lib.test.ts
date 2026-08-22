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
    const exam = await prisma.exam.create({
      data: { schoolId, academicYearId: yearId, name: "Midterm", term: "T1", examDate: new Date(), maxMarks: 100, passMarks: 40 },
    });
    examId = exam.id;
    const student = await prisma.student.create({ data: { schoolId, name: "Student One", dob: new Date("2015-01-01"), admissionNo: "A1" } });
    studentId = student.id;
    await prisma.enrollment.create({ data: { studentId, classId, academicYearId: yearId } });
  });

  it("enters marks with a subjectId and reads them back keyed by subjectId", async () => {
    const result = await enterMarks(prisma, {
      classId, examId, subjectId, teacherUserId: teacherId, schoolId, academicYearId: yearId,
      entries: [{ studentId, marksObtained: 90 }],
    });
    expect(result).toEqual({ ok: true });

    const marks = await getMarksForClassExam(prisma, { classId, examId, schoolId, academicYearId: yearId, role: "admin", userId: 0 });
    if (!marks.ok) throw new Error("expected ok");
    expect(marks.subjects).toEqual([{ id: subjectId, name: "Mathematics" }]);
    expect(marks.students[0].marks[subjectId]).toEqual({
      marksObtained: 90,
      maxMarks: 100,
      grade: "A",
      isAbsent: false,
      remarks: null,
    });
  });

  it("rejects a teacher not assigned to that subject on the class", async () => {
    const otherTeacher = await prisma.user.create({ data: { schoolId, phone: "+10000000002", role: "teacher", name: "Teacher Two" } });
    const result = await enterMarks(prisma, {
      classId, examId, subjectId, teacherUserId: otherTeacher.id, schoolId, academicYearId: yearId,
      entries: [{ studentId, marksObtained: 90 }],
    });
    expect(result).toEqual({ ok: false, error: "NOT_ASSIGNED" });
  });

  it("refuses to read marks for an exam from another year", async () => {
    const staleYear = await prisma.academicYear.create({
      data: { schoolId, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
    });
    const stale = await createExam(prisma, schoolId, staleYear.id, {
      name: "Old Midterm",
      term: "Term 1",
      examDate: "2024-09-01",
      maxMarks: 100,
      passMarks: 40,
    });
    if (!stale.ok) throw new Error("expected ok");

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
    const stale = await createExam(prisma, schoolId, staleYear.id, {
      name: "Old Midterm",
      term: "Term 1",
      examDate: "2024-09-01",
      maxMarks: 100,
      passMarks: 40,
    });
    if (!stale.ok) throw new Error("expected ok");

    const result = await enterMarks(prisma, {
      classId,
      examId: stale.id,
      subjectId,
      teacherUserId: teacherId,
      schoolId,
      academicYearId: yearId,
      entries: [{ studentId, marksObtained: 80 }],
    });

    expect(result).toEqual({ ok: false, error: "INVALID_EXAM" });
    expect(await prisma.mark.count({ where: { examId: stale.id } })).toBe(0);
  });

  it("takes maxMarks from the exam, not the caller", async () => {
    const exam = await createExam(prisma, schoolId, yearId, {
      name: "Midterm",
      term: "Term 1",
      examDate: "2026-09-01",
      maxMarks: 50,
      passMarks: 20,
    });
    if (!exam.ok) throw new Error("expected ok");

    const result = await enterMarks(prisma, {
      classId,
      examId: exam.id,
      subjectId,
      teacherUserId: teacherId,
      schoolId,
      academicYearId: yearId,
      entries: [{ studentId, marksObtained: 40 }],
    });

    expect(result).toEqual({ ok: true });

    const mark = await prisma.mark.findFirstOrThrow({ where: { examId: exam.id, studentId } });
    expect(mark.maxMarks).toBe(50);
    // 40/50 = 80%, which is the "B" bracket (>=75) under computeGrade's thresholds.
    expect(mark.grade).toBe("B");
  });

  it("rejects marks above the exam's maximum", async () => {
    const exam = await createExam(prisma, schoolId, yearId, {
      name: "Midterm",
      term: "Term 1",
      examDate: "2026-09-01",
      maxMarks: 50,
      passMarks: 20,
    });
    if (!exam.ok) throw new Error("expected ok");

    const result = await enterMarks(prisma, {
      classId,
      examId: exam.id,
      subjectId,
      teacherUserId: teacherId,
      schoolId,
      academicYearId: yearId,
      entries: [{ studentId, marksObtained: 80 }],
    });

    expect(result).toEqual({ ok: false, error: "INVALID_MARKS_RANGE" });
  });

  it("rejects an exam whose pass mark exceeds its maximum", async () => {
    await expect(
      createExam(prisma, schoolId, yearId, {
        name: "Broken",
        term: "Term 1",
        examDate: "2026-09-01",
        maxMarks: 50,
        passMarks: 80,
      })
    ).resolves.toEqual({ ok: false, error: "INVALID_PASS_MARKS" });
  });

  it("lets a teacher enter and read marks against an unpublished exam", async () => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(exam.published).toBe(false);

    const enterResult = await enterMarks(prisma, {
      classId, examId, subjectId, teacherUserId: teacherId, schoolId, academicYearId: yearId,
      entries: [{ studentId, marksObtained: 90 }],
    });
    expect(enterResult).toEqual({ ok: true });

    const marks = await getMarksForClassExam(prisma, {
      classId,
      examId,
      schoolId,
      academicYearId: yearId,
      role: "teacher",
      userId: teacherId,
    });
    if (!marks.ok) throw new Error("expected ok");
    expect(marks.students[0].marks[subjectId]).toEqual({
      marksObtained: 90,
      maxMarks: 100,
      grade: "A",
      isAbsent: false,
      remarks: null,
    });
  });

  it("records an absent student distinctly from an unentered one", async () => {
    const result = await enterMarks(prisma, {
      classId,
      examId,
      subjectId,
      teacherUserId: teacherId,
      schoolId,
      academicYearId: yearId,
      entries: [{ studentId, marksObtained: 0, isAbsent: true }],
    });

    expect(result).toEqual({ ok: true });

    const mark = await prisma.mark.findFirstOrThrow({ where: { examId, studentId } });
    expect(mark.isAbsent).toBe(true);
    expect(mark.grade).toBe("AB");
  });

  it("stamps the entering teacher and the year onto each mark", async () => {
    await enterMarks(prisma, {
      classId,
      examId,
      subjectId,
      teacherUserId: teacherId,
      schoolId,
      academicYearId: yearId,
      entries: [{ studentId, marksObtained: 80 }],
    });

    const mark = await prisma.mark.findFirstOrThrow({ where: { examId, studentId } });
    expect(mark.enteredById).toBe(teacherId);
    expect(mark.academicYearId).toBe(yearId);
    expect(mark.enteredAt).toBeInstanceOf(Date);
  });

  it("updates enteredById when a different teacher corrects a mark", async () => {
    const second = await prisma.user.create({
      data: { schoolId, phone: "+10000000055", role: "teacher", name: "Second Teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId, subjectId, teacherUserId: second.id, academicYearId: yearId },
    });

    await enterMarks(prisma, { classId, examId, subjectId, teacherUserId: teacherId, schoolId, academicYearId: yearId, entries: [{ studentId, marksObtained: 80 }] });
    await enterMarks(prisma, { classId, examId, subjectId, teacherUserId: second.id, schoolId, academicYearId: yearId, entries: [{ studentId, marksObtained: 85 }] });

    const mark = await prisma.mark.findFirstOrThrow({ where: { examId, studentId } });
    expect(mark.marksObtained).toBe(85);
    expect(mark.enteredById).toBe(second.id);
  });
});
