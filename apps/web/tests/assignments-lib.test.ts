import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear } from "./helpers/enrollment";
import { createAssignment, listAssignments, editAssignment, getAssignmentStatuses, updateAssignmentStatuses } from "../src/lib/assignments";

describe("assignments lib subjectId", () => {
  let schoolId: number;
  let classId: number;
  let subjectId: number;
  let teacherId: number;
  let yearId: number;
  let gradeId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const teacher = await prisma.user.create({ data: { schoolId, phone: "+10000000001", role: "teacher", name: "Teacher One" } });
    teacherId = teacher.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    gradeId = grade.id;
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Mathematics" } });
    subjectId = subject.id;
    const year = await createActiveYear(prisma, schoolId);
    yearId = year.id;
    const klass = await prisma.class.create({ data: { schoolId, section: "A", gradeId: grade.id, academicYearId: year.id } });
    classId = klass.id;
    await prisma.classTeacher.create({ data: { classId, subjectId, teacherUserId: teacherId, academicYearId: yearId } });
  });

  it("creates an assignment with a subjectId and lists it with subject name", async () => {
    const result = await createAssignment(prisma, {
      classId, teacherUserId: teacherId, subjectId, title: "HW1", dueDate: "2026-08-01", academicYearId: yearId,
    });
    expect(result.ok).toBe(true);

    const list = await listAssignments(prisma, { classId, schoolId, role: "admin", userId: 0, academicYearId: yearId });
    if (!list.ok) throw new Error("expected ok");
    expect(list.assignments[0]).toMatchObject({ subjectId, subjectName: "Mathematics", title: "HW1" });
  });

  it("rejects a teacher not assigned to that subject on the class", async () => {
    const otherTeacher = await prisma.user.create({ data: { schoolId, phone: "+10000000002", role: "teacher", name: "Teacher Two" } });
    const result = await createAssignment(prisma, {
      classId, teacherUserId: otherTeacher.id, subjectId, title: "HW1", dueDate: "2026-08-01", academicYearId: yearId,
    });
    expect(result).toEqual({ ok: false, error: "NOT_ASSIGNED" });
  });

  it("edits an assignment's subject", async () => {
    const created = await createAssignment(prisma, {
      classId, teacherUserId: teacherId, subjectId, title: "HW1", dueDate: "2026-08-01", academicYearId: yearId,
    });
    if (!created.ok) throw new Error("setup failed");
    const otherSubject = await prisma.subject.create({ data: { gradeId: (await prisma.class.findUnique({ where: { id: classId } }))!.gradeId, name: "Science" } });
    await prisma.classTeacher.create({
      data: { classId, subjectId: otherSubject.id, teacherUserId: teacherId, academicYearId: yearId },
    });
    const result = await editAssignment(prisma, {
      assignmentId: created.id, teacherUserId: teacherId, schoolId, fields: { subjectId: otherSubject.id },
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects an edit that moves the assignment to another school's subject", async () => {
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherGrade = await prisma.grade.create({
      data: { schoolId: otherSchool.id, name: "Grade 1" },
    });
    const otherSubject = await prisma.subject.create({
      data: { gradeId: otherGrade.id, name: "Foreign Maths" },
    });

    const created = await createAssignment(prisma, {
      classId,
      teacherUserId: teacherId,
      subjectId,
      title: "Original",
      dueDate: "2026-09-01",
      academicYearId: yearId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await editAssignment(prisma, {
      assignmentId: created.id,
      teacherUserId: teacherId,
      schoolId,
      fields: { subjectId: otherSubject.id },
    });

    expect(result).toEqual({ ok: false, error: "INVALID_SUBJECT" });

    const unchanged = await prisma.assignment.findUnique({ where: { id: created.id } });
    expect(unchanged?.subjectId).toBe(subjectId);
  });

  it("rejects an edit to a same-school subject the teacher is not assigned", async () => {
    const strangerSubject = await prisma.subject.create({
      data: { gradeId, name: "Unassigned Subject" },
    });

    const created = await createAssignment(prisma, {
      classId,
      teacherUserId: teacherId,
      subjectId,
      title: "Original",
      dueDate: "2026-09-01",
      academicYearId: yearId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await editAssignment(prisma, {
      assignmentId: created.id,
      teacherUserId: teacherId,
      schoolId,
      fields: { subjectId: strangerSubject.id },
    });

    expect(result).toEqual({ ok: false, error: "INVALID_SUBJECT" });
  });

  it("allows an edit to a subject the teacher is assigned in the same class", async () => {
    const secondSubject = await prisma.subject.create({
      data: { gradeId, name: "Science" },
    });
    await prisma.classTeacher.create({
      data: { classId, subjectId: secondSubject.id, teacherUserId: teacherId, academicYearId: yearId },
    });

    const created = await createAssignment(prisma, {
      classId,
      teacherUserId: teacherId,
      subjectId,
      title: "Original",
      dueDate: "2026-09-01",
      academicYearId: yearId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await editAssignment(prisma, {
      assignmentId: created.id,
      teacherUserId: teacherId,
      schoolId,
      fields: { subjectId: secondSubject.id },
    });

    expect(result).toEqual({ ok: true });
    const updated = await prisma.assignment.findUnique({ where: { id: created.id } });
    expect(updated?.subjectId).toBe(secondSubject.id);
  });

  it("refuses status updates from a teacher who teaches the class but not the subject", async () => {
    const otherSubject = await prisma.subject.create({
      data: { gradeId, name: "Music" },
    });
    const musicTeacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000099", role: "teacher", name: "Music Teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId, subjectId: otherSubject.id, teacherUserId: musicTeacher.id, academicYearId: yearId },
    });

    const created = await createAssignment(prisma, {
      classId,
      teacherUserId: teacherId,
      subjectId,
      title: "Maths homework",
      dueDate: "2026-09-01",
      academicYearId: yearId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await updateAssignmentStatuses(prisma, {
      assignmentId: created.id,
      schoolId,
      teacherUserId: musicTeacher.id,
      entries: [],
    });

    expect(result).toEqual({ ok: false, error: "NOT_ASSIGNED" });
  });
});
