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
});
