import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import {
  listClassFaculty,
  assignTeacherToSubject,
  unassignTeacherFromSubject,
  setClassTeacher,
} from "../src/lib/school-setup/class-teachers";

describe("class-teachers lib", () => {
  let schoolId: number;
  let classId: number;
  let subjectId: number;
  let teacherId: number;
  let yearId: number;

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
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date(), endDate: new Date(), status: "active" },
    });
    yearId = year.id;
    const klass = await prisma.class.create({ data: { schoolId, section: "A", gradeId: grade.id, academicYearId: year.id } });
    classId = klass.id;
    void yearId;
  });

  it("assigns a teacher to a subject and lists it", async () => {
    const result = await assignTeacherToSubject(prisma, { classId, schoolId, subjectId, teacherUserId: teacherId });
    expect(result).toEqual({ ok: true });

    const list = await listClassFaculty(prisma, { classId, schoolId });
    expect(list).toEqual({
      ok: true,
      assignments: [{ subjectId, subjectName: "Mathematics", teacherUserId: teacherId, teacherName: "Teacher One", isClassTeacher: false }],
    });
  });

  it("allows multiple teachers on the same subject", async () => {
    const teacher2 = await prisma.user.create({ data: { schoolId, phone: "+10000000002", role: "teacher", name: "Teacher Two" } });
    await assignTeacherToSubject(prisma, { classId, schoolId, subjectId, teacherUserId: teacherId });
    const second = await assignTeacherToSubject(prisma, { classId, schoolId, subjectId, teacherUserId: teacher2.id });
    expect(second).toEqual({ ok: true });

    const list = await listClassFaculty(prisma, { classId, schoolId });
    if (!list.ok) throw new Error("expected ok");
    expect(list.assignments).toHaveLength(2);
  });

  it("sets a class teacher from among assigned faculty and clears the previous holder", async () => {
    const teacher2 = await prisma.user.create({ data: { schoolId, phone: "+10000000003", role: "teacher", name: "Teacher Two" } });
    await assignTeacherToSubject(prisma, { classId, schoolId, subjectId, teacherUserId: teacherId });
    await assignTeacherToSubject(prisma, { classId, schoolId, subjectId, teacherUserId: teacher2.id });

    await setClassTeacher(prisma, { classId, schoolId, teacherUserId: teacherId });
    let list = await listClassFaculty(prisma, { classId, schoolId });
    if (!list.ok) throw new Error("expected ok");
    expect(list.assignments.find((a) => a.teacherUserId === teacherId)?.isClassTeacher).toBe(true);

    await setClassTeacher(prisma, { classId, schoolId, teacherUserId: teacher2.id });
    list = await listClassFaculty(prisma, { classId, schoolId });
    if (!list.ok) throw new Error("expected ok");
    expect(list.assignments.find((a) => a.teacherUserId === teacherId)?.isClassTeacher).toBe(false);
    expect(list.assignments.find((a) => a.teacherUserId === teacher2.id)?.isClassTeacher).toBe(true);
  });

  it("rejects setting a class teacher who isn't assigned to any subject on the class", async () => {
    const unassigned = await prisma.user.create({ data: { schoolId, phone: "+10000000004", role: "teacher", name: "Unassigned" } });
    const result = await setClassTeacher(prisma, { classId, schoolId, teacherUserId: unassigned.id });
    expect(result).toEqual({ ok: false, error: "NOT_ASSIGNED" });
  });

  it("unassigns a teacher from a subject", async () => {
    await assignTeacherToSubject(prisma, { classId, schoolId, subjectId, teacherUserId: teacherId });
    const result = await unassignTeacherFromSubject(prisma, { classId, schoolId, subjectId, teacherUserId: teacherId });
    expect(result).toEqual({ ok: true });

    const list = await listClassFaculty(prisma, { classId, schoolId });
    if (!list.ok) throw new Error("expected ok");
    expect(list.assignments).toHaveLength(0);
  });

  it("refuses to assign a deactivated teacher", async () => {
    const inactiveTeacher = await prisma.user.create({
      data: {
        schoolId,
        phone: "+10000000077",
        role: "teacher",
        name: "Former Teacher",
        status: "inactive",
      },
    });

    const result = await assignTeacherToSubject(prisma, {
      classId,
      schoolId,
      subjectId,
      teacherUserId: inactiveTeacher.id,
    });

    expect(result).toEqual({ ok: false, error: "TEACHER_INACTIVE" });

    const written = await prisma.classTeacher.count({
      where: { teacherUserId: inactiveTeacher.id },
    });
    expect(written).toBe(0);
  });

  it("still assigns an active teacher", async () => {
    const result = await assignTeacherToSubject(prisma, {
      classId,
      schoolId,
      subjectId,
      teacherUserId: teacherId,
    });

    expect(result).toEqual({ ok: true });
  });
});
