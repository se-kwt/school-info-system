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

describe("students.ts multiple parents", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("creates a student with two parents", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "Two Parent Student",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-200",
      parents: [
        { relationship: "Father", name: "Dad", phone: "+15550002000", email: "dad@example.com" },
        { relationship: "Mother", name: "Mom", phone: "+15550002001" },
      ],
    });
    expect(result.ok).toBe(true);

    const list = await listStudents(prisma, school.id);
    const created = list.find((s) => s.admissionNo === "SCH-200");
    expect(created?.parents).toEqual([
      { relationship: "Father", name: "Dad", phone: "+15550002000", email: "dad@example.com" },
      { relationship: "Mother", name: "Mom", phone: "+15550002001", email: null },
    ]);
  });

  it("rejects create with zero parents", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "No Parent",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-201",
      parents: [],
    });
    expect(result).toMatchObject({ ok: false, error: "PARENT_REQUIRED" });
  });

  it("reconciles parents on edit: adds, removes, and updates", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });
    const createResult = await createStudent(prisma, school.id, year.id, {
      name: "Reconcile Student",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-202",
      parents: [
        { relationship: "Father", name: "Dad", phone: "+15550002002" },
        { relationship: "Mother", name: "Mom", phone: "+15550002003" },
      ],
    });
    if (!createResult.ok) throw new Error("setup failed");

    const editResult = await editStudent(prisma, {
      studentId: createResult.student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: {
        parents: [
          { relationship: "Father", name: "Dad Updated", phone: "+15550002002", email: "dad@example.com" },
          { relationship: "Guardian", name: "New Guardian", phone: "+15550002004" },
        ],
      },
    });
    expect(editResult.ok).toBe(true);

    const list = await listStudents(prisma, school.id);
    const edited = list.find((s) => s.admissionNo === "SCH-202");
    expect(edited?.parents).toEqual([
      { relationship: "Father", name: "Dad Updated", phone: "+15550002002", email: "dad@example.com" },
      { relationship: "Guardian", name: "New Guardian", phone: "+15550002004", email: null },
    ]);
  });
});

describe("students.ts sibling links", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("links a sibling on create and it's visible from both sides", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });
    const existingSibling = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Existing Sibling",
      dob: new Date("2014-01-01"),
      admissionNo: "SCH-300",
    });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "New Student",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-301",
      parents: [{ relationship: "Mother", name: "A Parent", phone: "+15550003000" }],
      siblingStudentIds: [existingSibling.id],
    });
    if (!result.ok) throw new Error("create failed");

    const list = await listStudents(prisma, school.id);
    const created = list.find((s) => s.admissionNo === "SCH-301");
    expect(created?.siblings.map((s) => s.admissionNo)).toEqual(["SCH-300"]);

    const other = list.find((s) => s.admissionNo === "SCH-300");
    expect(other?.siblings.map((s) => s.admissionNo)).toEqual(["SCH-301"]);
  });

  it("rejects a self-reference sibling with INVALID_SIBLING", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Self Ref",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-302",
    });

    const result = await editStudent(prisma, {
      studentId: student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { siblingStudentIds: [student.id] },
    });
    expect(result).toMatchObject({ ok: false, error: "INVALID_SIBLING" });
  });

  it("rejects a sibling id from another school with INVALID_SIBLING", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-303",
    });
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await prisma.class.create({ data: { schoolId: otherSchool.id, name: "Grade 3", section: "A" } });
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: otherSchool.id,
      classId: otherClass.id,
      academicYearId: otherYear.id,
      name: "Cross Tenant",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-CROSS-300",
    });

    const result = await editStudent(prisma, {
      studentId: student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { siblingStudentIds: [otherStudent.id] },
    });
    expect(result).toMatchObject({ ok: false, error: "INVALID_SIBLING" });
  });

  it("replaces the sibling set on edit", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", section: "A" } });
    const siblingA = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Sibling A",
      dob: new Date("2014-01-01"),
      admissionNo: "SCH-304",
    });
    const siblingB = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Sibling B",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-305",
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Main Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-306",
    });
    await editStudent(prisma, {
      studentId: student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { siblingStudentIds: [siblingA.id] },
    });

    const result = await editStudent(prisma, {
      studentId: student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { siblingStudentIds: [siblingB.id] },
    });
    expect(result.ok).toBe(true);

    const list = await listStudents(prisma, school.id);
    const main = list.find((s) => s.admissionNo === "SCH-306");
    expect(main?.siblings.map((s) => s.admissionNo)).toEqual(["SCH-305"]);
  });
});
