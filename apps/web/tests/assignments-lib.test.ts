import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear } from "./helpers/enrollment";
import { createAssignment, listAssignments, editAssignment } from "../src/lib/assignments";

describe("assignments lib subjectId", () => {
  let schoolId: number;
  let classId: number;
  let subjectId: number;
  let teacherId: number;
  let yearId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const teacher = await prisma.user.create({ data: { schoolId, phone: "+10000000001", role: "teacher", name: "Teacher One" } });
    teacherId = teacher.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
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
    const result = await editAssignment(prisma, {
      assignmentId: created.id, teacherUserId: teacherId, schoolId, fields: { subjectId: otherSubject.id },
    });
    expect(result).toEqual({ ok: true });
  });
});
