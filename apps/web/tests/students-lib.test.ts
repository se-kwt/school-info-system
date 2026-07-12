import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createEnrolledStudent } from "./helpers/enrollment";
import { createStudent, editStudent, listStudents } from "../src/lib/school-setup/students";

describe("students.ts scalar fields", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("creates a student with gender, studentIdNumber, and dateOfJoin", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "New Student",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-100",
      gender: "female",
      studentIdNumber: "STU-100",
      dateOfJoin: "2026-06-01",
      parents: [{ relationship: "Mother", name: "A Parent", phone: "+15550001000" }],
    });
    expect(result.ok).toBe(true);

    const list = await listStudents(prisma, school.id);
    const created = list.find((s) => s.admissionNo === "SCH-100");
    expect(created).toMatchObject({
      gender: "female",
      studentIdNumber: "STU-100",
      dateOfJoin: "2026-06-01",
    });
  });

  it("rejects a duplicate studentIdNumber on create with DUPLICATE_STUDENT_ID", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });
    await createStudent(prisma, school.id, year.id, {
      name: "First",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-101",
      studentIdNumber: "STU-DUP",
      parents: [{ relationship: "Mother", name: "A Parent", phone: "+15550001001" }],
    });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "Second",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-102",
      studentIdNumber: "STU-DUP",
      parents: [{ relationship: "Mother", name: "Another Parent", phone: "+15550001002" }],
    });
    expect(result).toMatchObject({ ok: false, error: "DUPLICATE_STUDENT_ID" });
  });

  it("edits gender, studentIdNumber, and dateOfJoin", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Existing",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-103",
    });

    const result = await editStudent(prisma, {
      studentId: student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { gender: "male", studentIdNumber: "STU-103", dateOfJoin: "2026-06-15" },
    });
    expect(result.ok).toBe(true);

    const updated = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updated).toMatchObject({ gender: "male", studentIdNumber: "STU-103" });
    expect(updated?.dateOfJoin?.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("rejects a duplicate studentIdNumber on edit with DUPLICATE_STUDENT_ID", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });
    await createStudent(prisma, school.id, year.id, {
      name: "First",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-104",
      studentIdNumber: "STU-TAKEN",
      parents: [{ relationship: "Mother", name: "A Parent", phone: "+15550001004" }],
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Second",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-105",
    });

    const result = await editStudent(prisma, {
      studentId: student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { studentIdNumber: "STU-TAKEN" },
    });
    expect(result).toMatchObject({ ok: false, error: "DUPLICATE_STUDENT_ID" });
  });
});
