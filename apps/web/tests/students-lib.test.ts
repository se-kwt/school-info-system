import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createClass, createEnrolledStudent } from "./helpers/enrollment";
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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "New Student",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-100",
      gender: "female",
      studentIdNumber: "STU-100",
      dateOfJoin: "2026-06-01",
      parents: [{ relationship: "mother", name: "A Parent", phone: "+15550001000" }],
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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
    await createStudent(prisma, school.id, year.id, {
      name: "First",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-101",
      studentIdNumber: "STU-DUP",
      parents: [{ relationship: "mother", name: "A Parent", phone: "+15550001001" }],
    });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "Second",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-102",
      studentIdNumber: "STU-DUP",
      parents: [{ relationship: "mother", name: "Another Parent", phone: "+15550001002" }],
    });
    expect(result).toMatchObject({ ok: false, error: "DUPLICATE_STUDENT_ID" });
  });

  it("edits gender, studentIdNumber, and dateOfJoin", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
    await createStudent(prisma, school.id, year.id, {
      name: "First",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-104",
      studentIdNumber: "STU-TAKEN",
      parents: [{ relationship: "mother", name: "A Parent", phone: "+15550001004" }],
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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "Two Parent Student",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-200",
      parents: [
        { relationship: "father", name: "Dad", phone: "+15550002000", email: "dad@example.com" },
        { relationship: "mother", name: "Mom", phone: "+15550002001" },
      ],
    });
    expect(result.ok).toBe(true);

    const list = await listStudents(prisma, school.id);
    const created = list.find((s) => s.admissionNo === "SCH-200");
    expect(created?.parents).toEqual([
      { relationship: "father", name: "Dad", phone: "+15550002000", email: "dad@example.com" },
      { relationship: "mother", name: "Mom", phone: "+15550002001", email: null },
    ]);
  });

  it("rejects create with zero parents", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
    const createResult = await createStudent(prisma, school.id, year.id, {
      name: "Reconcile Student",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-202",
      parents: [
        { relationship: "father", name: "Dad", phone: "+15550002002" },
        { relationship: "mother", name: "Mom", phone: "+15550002003" },
      ],
    });
    if (!createResult.ok) throw new Error("setup failed");

    const editResult = await editStudent(prisma, {
      studentId: createResult.student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: {
        parents: [
          { relationship: "father", name: "Dad Updated", phone: "+15550002002", email: "dad@example.com" },
          { relationship: "guardian", name: "New Guardian", phone: "+15550002004" },
        ],
      },
    });
    expect(editResult.ok).toBe(true);

    const list = await listStudents(prisma, school.id);
    const edited = list.find((s) => s.admissionNo === "SCH-202");
    expect(edited?.parents).toEqual([
      { relationship: "father", name: "Dad Updated", phone: "+15550002002", email: "dad@example.com" },
      { relationship: "guardian", name: "New Guardian", phone: "+15550002004", email: null },
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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
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
      parents: [{ relationship: "mother", name: "A Parent", phone: "+15550003000" }],
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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
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
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 3", section: "A" });
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
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
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


  it("rejects createStudent when the parent phone belongs to a user in a different school", async () => {
    const schoolA = await prisma.school.create({ data: { name: "School A" } });
    const schoolB = await prisma.school.create({ data: { name: "School B" } });
    const yearA = await createActiveYear(prisma, schoolA.id);
    const yearB = await createActiveYear(prisma, schoolB.id);
    const classA = await createClass(prisma, { schoolId: schoolA.id, academicYearId: yearA.id, name: "Grade 3", section: "A" });
    const classB = await createClass(prisma, { schoolId: schoolB.id, academicYearId: yearB.id, name: "Grade 3", section: "A" });

    await createStudent(prisma, schoolA.id, yearA.id, {
      name: "Student A",
      dob: "2016-01-01",
      classId: classA.id,
      admissionNo: "A-100",
      parents: [{ relationship: "mother", name: "Shared Parent", phone: "+15550009999" }],
    });

    const result = await createStudent(prisma, schoolB.id, yearB.id, {
      name: "Student B",
      dob: "2016-01-01",
      classId: classB.id,
      admissionNo: "B-100",
      parents: [{ relationship: "mother", name: "Shared Parent", phone: "+15550009999" }],
    });

    expect(result).toMatchObject({ ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" });
  });

  it("rejects editStudent when the new parent phone belongs to a user in a different school", async () => {
    const schoolA = await prisma.school.create({ data: { name: "School A" } });
    const schoolB = await prisma.school.create({ data: { name: "School B" } });
    const yearA = await createActiveYear(prisma, schoolA.id);
    const yearB = await createActiveYear(prisma, schoolB.id);
    const classA = await createClass(prisma, { schoolId: schoolA.id, academicYearId: yearA.id, name: "Grade 3", section: "A" });
    const classB = await createClass(prisma, { schoolId: schoolB.id, academicYearId: yearB.id, name: "Grade 3", section: "A" });

    await createStudent(prisma, schoolA.id, yearA.id, {
      name: "Student A",
      dob: "2016-01-01",
      classId: classA.id,
      admissionNo: "A-101",
      parents: [{ relationship: "mother", name: "Shared Parent", phone: "+15550008888" }],
    });

    const studentB = await createEnrolledStudent(prisma, {
      schoolId: schoolB.id,
      classId: classB.id,
      academicYearId: yearB.id,
      name: "Student B",
      dob: new Date("2016-01-01"),
      admissionNo: "B-101",
    });

    const result = await editStudent(prisma, {
      studentId: studentB.id,
      schoolId: schoolB.id,
      academicYearId: yearB.id,
      fields: { parents: [{ relationship: "father", name: "Shared Parent", phone: "+15550008888" }] },
    });

    expect(result).toMatchObject({ ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" });
  });

  it("rejects editStudent when a parent phone belongs to a non-parent user in the same school", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550007777", name: "A Teacher", role: "teacher" },
    });

    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Existing",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-200",
    });

    const result = await editStudent(prisma, {
      studentId: student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { parents: [{ relationship: "father", name: teacher.name, phone: teacher.phone }] },
    });

    expect(result).toMatchObject({ ok: false, error: "PHONE_WRONG_ROLE" });

    const unchangedTeacher = await prisma.user.findUnique({ where: { id: teacher.id } });
    expect(unchangedTeacher).toMatchObject({ role: "teacher", name: "A Teacher" });
  });

  it("rejects createStudent when a parent phone is malformed", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "New Student",
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: "SCH-INVALID-PHONE",
      parents: [{ relationship: "mother", name: "A Parent", phone: "not-a-phone" }],
    });

    expect(result).toMatchObject({ ok: false, error: "INVALID_PHONE" });
  });

  it("rejects editStudent when a parent phone is malformed", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Existing",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-201",
    });

    const result = await editStudent(prisma, {
      studentId: student.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { parents: [{ relationship: "father", name: "Bad Phone Parent", phone: "not-a-phone" }] },
    });

    expect(result).toMatchObject({ ok: false, error: "INVALID_PHONE" });
  });

});

describe("students.ts admission record fields", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("stores the full admission record", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "Full Record",
      dob: "2015-01-01",
      classId: klass.id,
      admissionNo: "FULL-001",
      address: "12 Example Road, Kochi",
      bloodGroup: "O+",
      nationality: "Indian",
      religion: "Hindu",
      previousSchool: "Little Flower LP",
      emergencyContactName: "Aunt",
      emergencyContactPhone: "+919876543210",
      category: "General",
      admissionDate: "2026-04-01",
      parents: [{ relationship: "guardian", name: "Parent", phone: "+10000000060" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const student = await prisma.student.findUniqueOrThrow({ where: { id: result.student.id } });
    expect(student.address).toBe("12 Example Road, Kochi");
    expect(student.bloodGroup).toBe("O+");
    expect(student.previousSchool).toBe("Little Flower LP");
    expect(student.emergencyContactPhone).toBe("+919876543210");
    expect(student.admissionDate?.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("still creates a student when the optional fields are omitted", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "Minimal",
      dob: "2015-01-01",
      classId: klass.id,
      admissionNo: "MIN-001",
      parents: [{ relationship: "guardian", name: "Parent", phone: "+10000000061" }],
    });

    expect(result.ok).toBe(true);
  });
});

describe("students.ts year scope on class validation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("refuses to create a student against a class from a different academic year", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const activeYear = await createActiveYear(prisma, school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 3" } });
    const activeClass = await createClass(prisma, { schoolId: school.id, academicYearId: activeYear.id, name: "Grade 3", section: "A", gradeId: grade.id });

    const staleYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2025-26",
        startDate: new Date("2025-04-01"),
        endDate: new Date("2026-03-31"),
        status: "archived",
      },
    });
    const staleClass = await prisma.class.create({
      data: { schoolId: school.id, gradeId: grade.id, section: "A", academicYearId: staleYear.id },
    });

    const result = await createStudent(prisma, school.id, activeYear.id, {
      name: "Ghost Student",
      dob: "2015-01-01",
      classId: staleClass.id,
      admissionNo: "GHOST-001",
      parents: [{ relationship: "guardian", name: "Parent", phone: "+10000000042" }],
    });

    expect(result).toEqual({ ok: false, error: "INVALID_CLASS" });

    const orphan = await prisma.student.findUnique({ where: { admissionNo: "GHOST-001" } });
    expect(orphan).toBeNull();
    const enrollments = await prisma.enrollment.count({ where: { classId: staleClass.id } });
    expect(enrollments).toBe(0);
  });

  it("refuses to move a student into a class from a different academic year", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const activeYear = await createActiveYear(prisma, school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 3" } });
    const activeClass = await createClass(prisma, { schoolId: school.id, academicYearId: activeYear.id, name: "Grade 3", section: "A", gradeId: grade.id });

    const staleYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2025-26",
        startDate: new Date("2025-04-01"),
        endDate: new Date("2026-03-31"),
        status: "archived",
      },
    });
    const staleClass = await prisma.class.create({
      data: { schoolId: school.id, gradeId: grade.id, section: "A", academicYearId: staleYear.id },
    });

    const created = await createStudent(prisma, school.id, activeYear.id, {
      name: "Real Student",
      dob: "2015-01-01",
      classId: activeClass.id,
      admissionNo: "REAL-001",
      parents: [{ relationship: "guardian", name: "Parent", phone: "+10000000043" }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await editStudent(prisma, {
      studentId: created.student.id,
      schoolId: school.id,
      academicYearId: activeYear.id,
      fields: { classId: staleClass.id },
    });

    expect(result).toEqual({ ok: false, error: "INVALID_CLASS" });

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: created.student.id, academicYearId: activeYear.id } },
    });
    expect(enrollment?.classId).toBe(activeClass.id);
  });
});

describe("students.ts class capacity", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("refuses to enrol a student beyond the class capacity", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    await prisma.class.update({ where: { id: klass.id }, data: { capacity: 1 } });
    await createStudent(prisma, school.id, year.id, {
      name: "First",
      dob: "2015-01-01",
      classId: klass.id,
      admissionNo: "CAP-001",
      parents: [{ relationship: "guardian", name: "P", phone: "+10000000080" }],
    });

    const result = await createStudent(prisma, school.id, year.id, {
      name: "Second",
      dob: "2015-01-01",
      classId: klass.id,
      admissionNo: "CAP-002",
      parents: [{ relationship: "guardian", name: "P", phone: "+10000000081" }],
    });

    expect(result).toEqual({ ok: false, error: "CLASS_FULL" });
  });

  it("allows enrolment when no capacity is set", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

    // capacity is null by default -- no limit
    const result = await createStudent(prisma, school.id, year.id, {
      name: "Unlimited",
      dob: "2015-01-01",
      classId: klass.id,
      admissionNo: "CAP-003",
      parents: [{ relationship: "guardian", name: "P", phone: "+10000000082" }],
    });

    expect(result.ok).toBe(true);
  });

  it("refuses to reassign a student into a class that is already full", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const fullClass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
    const otherClass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 4", section: "A" });
    await prisma.class.update({ where: { id: fullClass.id }, data: { capacity: 1 } });

    await createStudent(prisma, school.id, year.id, {
      name: "Existing",
      dob: "2015-01-01",
      classId: fullClass.id,
      admissionNo: "CAP-010",
      parents: [{ relationship: "guardian", name: "P", phone: "+10000000090" }],
    });
    const mover = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: otherClass.id,
      academicYearId: year.id,
      name: "Mover",
      dob: new Date("2015-01-01"),
      admissionNo: "CAP-011",
    });

    const result = await editStudent(prisma, {
      studentId: mover.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { classId: fullClass.id },
    });

    expect(result).toEqual({ ok: false, error: "CLASS_FULL" });
  });

  it("allows a class reassignment when the target class has room", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const roomyClass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
    const otherClass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 4", section: "A" });
    await prisma.class.update({ where: { id: roomyClass.id }, data: { capacity: 5 } });

    const mover = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: otherClass.id,
      academicYearId: year.id,
      name: "Mover",
      dob: new Date("2015-01-01"),
      admissionNo: "CAP-012",
    });

    const result = await editStudent(prisma, {
      studentId: mover.id,
      schoolId: school.id,
      academicYearId: year.id,
      fields: { classId: roomyClass.id },
    });

    expect(result).toEqual({ ok: true });
  });
});

describe("students.ts pagination", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("listStudents respects page/pageSize and returns a smaller slice", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
    for (let i = 0; i < 5; i++) {
      await createStudent(prisma, school.id, year.id, {
        name: `Student ${i}`,
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: `PAGE-${i}`,
        parents: [{ relationship: "mother", name: "A Parent", phone: `+1555000${1000 + i}` }],
      });
    }

    const firstPage = await listStudents(prisma, school.id, { page: 1, pageSize: 2 });
    const secondPage = await listStudents(prisma, school.id, { page: 2, pageSize: 2 });

    expect(firstPage).toHaveLength(2);
    expect(secondPage).toHaveLength(2);
    expect(firstPage.map((s) => s.admissionNo)).not.toEqual(secondPage.map((s) => s.admissionNo));

    const allStudents = await listStudents(prisma, school.id); // no options -- unchanged behavior
    expect(allStudents.length).toBeGreaterThanOrEqual(5);
  });

  it("still resolves a sibling that falls on a different page", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 4", section: "A" });

    // Create 5 students named so alphabetical (name asc) order is predictable:
    // Alpha, Bravo, Charlie, Delta, Echo. Make Alpha and Echo siblings --
    // with pageSize 2 they land on page 1 and page 3 respectively.
    const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
    const created: { id: number; admissionNo: string }[] = [];
    for (let i = 0; i < names.length; i++) {
      const result = await createStudent(prisma, school.id, year.id, {
        name: names[i],
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: `SIB-${i}`,
        parents: [{ relationship: "mother", name: "A Parent", phone: `+1555001${1000 + i}` }],
      });
      if (!result.ok) throw new Error("create failed");
      created.push({ id: result.student.id, admissionNo: result.student.admissionNo });
    }

    const alpha = created[0]; // page 1
    const echo = created[4]; // page 3

    await prisma.studentSibling.create({ data: { studentId: alpha.id, siblingId: echo.id } });

    const firstPage = await listStudents(prisma, school.id, { page: 1, pageSize: 2 });
    const alphaOnPage1 = firstPage.find((s) => s.admissionNo === alpha.admissionNo);
    expect(alphaOnPage1).toBeDefined();
    // Echo (on page 3) must still show up as Alpha's sibling, not be dropped.
    expect(alphaOnPage1?.siblings.map((s) => s.admissionNo)).toEqual([echo.admissionNo]);

    const thirdPage = await listStudents(prisma, school.id, { page: 3, pageSize: 2 });
    const echoOnPage3 = thirdPage.find((s) => s.admissionNo === echo.admissionNo);
    expect(echoOnPage3).toBeDefined();
    expect(echoOnPage3?.siblings.map((s) => s.admissionNo)).toEqual([alpha.admissionNo]);
  });
});

describe("students.ts gender and relationship enums", () => {
  let schoolId: number;
  let activeYearId: number;
  let classId: number;
  let parentUserId: number;
  let studentId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
    schoolId = school.id;
    activeYearId = year.id;
    classId = klass.id;

    const parent = await prisma.user.create({
      data: { schoolId, phone: "+10000000099", name: "Existing Parent", role: "parent" },
    });
    parentUserId = parent.id;
    const student = await createEnrolledStudent(prisma, {
      schoolId,
      classId,
      academicYearId: activeYearId,
      name: "Existing Student",
      dob: new Date("2015-01-01"),
      admissionNo: "ENUM-000",
    });
    studentId = student.id;
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("accepts a third gender value", async () => {
    const result = await createStudent(prisma, schoolId, activeYearId, {
      name: "Third", dob: "2015-01-01", classId, admissionNo: "G-001", gender: "other",
      parents: [{ relationship: "guardian", name: "P", phone: "+10000000090" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const student = await prisma.student.findUniqueOrThrow({ where: { id: result.student.id } });
    expect(student.gender).toBe("other");
  });

  it("rejects a relationship outside the enum", async () => {
    await expect(
      prisma.parentStudent.create({
        data: { parentUserId, studentId, relationship: "Uncle's Neighbour" as never },
      })
    ).rejects.toThrow();
  });

  it("accepts each enum relationship", async () => {
    const result = await createStudent(prisma, schoolId, activeYearId, {
      name: "Rel", dob: "2015-01-01", classId, admissionNo: "R-001",
      parents: [
        { relationship: "father", name: "Dad", phone: "+10000000091" },
        { relationship: "mother", name: "Mum", phone: "+10000000092" },
      ],
    });

    expect(result.ok).toBe(true);
  });
});
