import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { listClasses, createClass, editClass, deleteClass } from "../src/lib/school-setup/classes";

describe("classes lib", () => {
  let schoolId: number;
  let gradeId: number;
  let yearId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    gradeId = grade.id;
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date("2026-06-01"), endDate: new Date("2027-04-30"), status: "active" },
    });
    yearId = year.id;
  });

  it("creates and lists a class instance scoped to grade + year", async () => {
    const created = await createClass(prisma, schoolId, { gradeId, section: "A", academicYearId: yearId });
    expect(created.ok).toBe(true);

    const classes = await listClasses(prisma, schoolId);
    expect(classes).toEqual([
      { id: expect.any(Number), gradeId, gradeName: "Grade 1", section: "A", academicYearId: yearId, archived: false },
    ]);
  });

  it("rejects a duplicate grade+section+year combination", async () => {
    await createClass(prisma, schoolId, { gradeId, section: "A", academicYearId: yearId });
    const duplicate = await createClass(prisma, schoolId, { gradeId, section: "A", academicYearId: yearId });
    expect(duplicate).toEqual({ ok: false, error: "DUPLICATE" });
  });

  it("allows the same grade+section in a different academic year", async () => {
    await createClass(prisma, schoolId, { gradeId, section: "A", academicYearId: yearId });
    const nextYear = await prisma.academicYear.create({
      data: { schoolId, name: "2027-28", startDate: new Date("2027-06-01"), endDate: new Date("2028-04-30"), status: "upcoming" },
    });
    const result = await createClass(prisma, schoolId, { gradeId, section: "A", academicYearId: nextYear.id });
    expect(result.ok).toBe(true);
  });

  it("edits a class section", async () => {
    const created = await createClass(prisma, schoolId, { gradeId, section: "A", academicYearId: yearId });
    if (!created.ok) throw new Error("setup failed");
    const result = await editClass(prisma, { classId: created.class.id, schoolId, fields: { section: "B" } });
    expect(result).toEqual({ ok: true });
  });

  it("rejects editClass when the new gradeId belongs to a different school", async () => {
    const schoolA = await prisma.school.create({ data: { name: "School A" } });
    const schoolB = await prisma.school.create({ data: { name: "School B" } });
    const yearA = await prisma.academicYear.create({
      data: { schoolId: schoolA.id, name: "2026-27", startDate: new Date("2026-06-01"), endDate: new Date("2027-04-30"), status: "active" },
    });
    const gradeA = await prisma.grade.create({ data: { schoolId: schoolA.id, name: "Grade A" } });
    const gradeB = await prisma.grade.create({ data: { schoolId: schoolB.id, name: "Grade B" } }); // different school
    const classA = await createClass(prisma, schoolA.id, { gradeId: gradeA.id, section: "A", academicYearId: yearA.id });
    if (!classA.ok) throw new Error("setup failed");

    const result = await editClass(prisma, {
      classId: classA.class.id,
      schoolId: schoolA.id,
      fields: { gradeId: gradeB.id },
    });

    expect(result).toMatchObject({ ok: false, error: "INVALID_GRADE" });
  });

  it("blocks deleting a class with enrollment history", async () => {
    const created = await createClass(prisma, schoolId, { gradeId, section: "A", academicYearId: yearId });
    if (!created.ok) throw new Error("setup failed");
    const student = await prisma.student.create({
      data: { schoolId, name: "Student One", dob: new Date("2015-01-01"), admissionNo: "A1" },
    });
    await prisma.enrollment.create({ data: { studentId: student.id, classId: created.class.id, academicYearId: yearId } });

    const result = await deleteClass(prisma, { classId: created.class.id, schoolId });
    expect(result).toEqual({ ok: false, error: "HAS_HISTORY" });
  });
});
