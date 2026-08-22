import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createStaff, editStaff, listStaff } from "../src/lib/school-setup/staff";

describe("staff lib subject assignment", () => {
  let schoolId: number;
  let classId: number;
  let subjectId: number;
  let yearId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Mathematics" } });
    subjectId = subject.id;
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date(), endDate: new Date(), status: "active" },
    });
    yearId = year.id;
    const klass = await prisma.class.create({ data: { schoolId, section: "A", gradeId: grade.id, academicYearId: year.id } });
    classId = klass.id;
  });

  it("creates a teacher with a subject assignment and lists it with subject/grade names", async () => {
    const result = await createStaff(prisma, schoolId, yearId, {
      name: "Teacher One", phone: "+10000000009", role: "teacher", classId, subjectId,
    });
    expect(result.ok).toBe(true);

    const staff = await listStaff(prisma, schoolId);
    const created = staff.find((s) => s.phone === "+10000000009");
    expect(created?.classAssignment).toEqual({ gradeName: "Grade 1", section: "A", subjectName: "Mathematics" });
  });

  it("rejects a subject that doesn't belong to the target class's grade", async () => {
    const otherGrade = await prisma.grade.create({ data: { schoolId, name: "Grade 2" } });
    const otherSubject = await prisma.subject.create({ data: { gradeId: otherGrade.id, name: "Science" } });
    const result = await createStaff(prisma, schoolId, yearId, {
      name: "Teacher Two", phone: "+10000000010", role: "teacher", classId, subjectId: otherSubject.id,
    });
    expect(result).toEqual({ ok: false, error: "INVALID_SUBJECT" });
  });

  it("rejects createStaff when the phone is malformed", async () => {
    const result = await createStaff(prisma, schoolId, yearId, {
      name: "Bad Phone", phone: "not-a-phone", role: "admin",
    });
    expect(result).toEqual({ ok: false, error: "INVALID_PHONE" });
  });

  it("rejects editStaff when the new phone is malformed", async () => {
    const created = await createStaff(prisma, schoolId, yearId, {
      name: "Admin One", phone: "+10000000011", role: "admin",
    });
    expect(created.ok).toBe(true);
    const staffId = created.ok ? created.staff.id : -1;

    const result = await editStaff(prisma, {
      userId: staffId,
      schoolId,
      academicYearId: yearId,
      fields: { phone: "not-a-phone" },
    });
    expect(result).toEqual({ ok: false, error: "INVALID_PHONE" });
  });

  it("rejects assigning a class/subject to an inactive teacher via editStaff, and writes no ClassTeacher row", async () => {
    const inactiveTeacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000012", role: "teacher", name: "Former Teacher", status: "inactive" },
    });

    const result = await editStaff(prisma, {
      userId: inactiveTeacher.id,
      schoolId,
      academicYearId: yearId,
      fields: { classId, subjectId },
    });
    expect(result).toEqual({ ok: false, error: "TEACHER_INACTIVE" });

    const rows = await prisma.classTeacher.findMany({ where: { teacherUserId: inactiveTeacher.id } });
    expect(rows).toHaveLength(0);
  });

  it("still allows assigning a class/subject to an active teacher via editStaff", async () => {
    const activeTeacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000013", role: "teacher", name: "Active Teacher", status: "active" },
    });

    const result = await editStaff(prisma, {
      userId: activeTeacher.id,
      schoolId,
      academicYearId: yearId,
      fields: { classId, subjectId },
    });
    expect(result).toEqual({ ok: true });

    const rows = await prisma.classTeacher.findMany({ where: { teacherUserId: activeTeacher.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ classId, subjectId, academicYearId: yearId });
  });
});

describe("staff lib pagination", () => {
  let schoolId: number;
  let yearId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date(), endDate: new Date(), status: "active" },
    });
    yearId = year.id;
  });

  it("listStaff respects page/pageSize and returns a smaller slice", async () => {
    for (let i = 0; i < 5; i++) {
      await createStaff(prisma, schoolId, yearId, {
        name: `Staff ${i}`,
        phone: `+1000000${100 + i}`,
        role: "admin",
      });
    }

    const firstPage = await listStaff(prisma, schoolId, { page: 1, pageSize: 2 });
    const secondPage = await listStaff(prisma, schoolId, { page: 2, pageSize: 2 });

    expect(firstPage).toHaveLength(2);
    expect(secondPage).toHaveLength(2);
    expect(firstPage.map((s) => s.phone)).not.toEqual(secondPage.map((s) => s.phone));

    const allStaff = await listStaff(prisma, schoolId); // no options -- unchanged behavior
    expect(allStaff.length).toBeGreaterThanOrEqual(5);
  });
});
