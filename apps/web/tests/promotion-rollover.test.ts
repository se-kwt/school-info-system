import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { cloneClasses, cloneFaculty } from "../src/lib/promotion/rollover";

describe("rollover: classes", () => {
  let schoolId: number;
  let fromYearId: number;
  let toYearId: number;
  let gradeId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Rollover School" } });
    schoolId = school.id;
    const fromYear = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });
    fromYearId = fromYear.id;
    const toYear = await prisma.academicYear.create({
      data: { schoolId, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
    });
    toYearId = toYear.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    gradeId = grade.id;
  });

  it("creates one class in the target year per class in the source year", async () => {
    await prisma.class.createMany({
      data: [
        { schoolId, gradeId, section: "A", academicYearId: fromYearId },
        { schoolId, gradeId, section: "B", academicYearId: fromYearId },
      ],
    });

    const map = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    const cloned = await prisma.class.findMany({
      where: { academicYearId: toYearId },
      orderBy: { section: "asc" },
    });
    expect(cloned.map((c) => c.section)).toEqual(["A", "B"]);
    expect(cloned.every((c) => c.gradeId === gradeId && c.archived === false)).toBe(true);
    expect(map.size).toBe(2);
  });

  it("is idempotent", async () => {
    await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });

    await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(await prisma.class.count({ where: { academicYearId: toYearId } })).toBe(1);
  });

  it("adopts a class the admin already created by hand", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const manual = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: toYearId } });

    const map = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(await prisma.class.count({ where: { academicYearId: toYearId } })).toBe(1);
    expect(map.get(source.id)).toBe(manual.id);
  });

  it("skips archived source classes", async () => {
    await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    await prisma.class.create({ data: { schoolId, gradeId, section: "Z", academicYearId: fromYearId, archived: true } });

    await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    const sections = (await prisma.class.findMany({ where: { academicYearId: toYearId } })).map((c) => c.section);
    expect(sections).toEqual(["A"]);
  });
});

describe("rollover: faculty", () => {
  let schoolId: number;
  let fromYearId: number;
  let toYearId: number;
  let gradeId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Rollover School" } });
    schoolId = school.id;
    const fromYear = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });
    fromYearId = fromYear.id;
    const toYear = await prisma.academicYear.create({
      data: { schoolId, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
    });
    toYearId = toYear.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    gradeId = grade.id;
  });

  it("clones faculty assignments onto the cloned classes", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
    const teacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000201", role: "teacher", name: "Maths Teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId: source.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: fromYearId, isClassTeacher: true },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    const result = await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(result).toEqual({ cloned: 1, skippedInactive: 0 });

    const cloned = await prisma.classTeacher.findFirstOrThrow({ where: { academicYearId: toYearId } });
    expect(cloned.classId).toBe(classMap.get(source.id));
    expect(cloned.teacherUserId).toBe(teacher.id);
    expect(cloned.subjectId).toBe(subject.id);
    expect(cloned.isClassTeacher).toBe(true);
  });

  it("skips assignments whose teacher is no longer active, and reports them", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
    const leaver = await prisma.user.create({
      data: { schoolId, phone: "+10000000202", role: "teacher", name: "Departed", status: "inactive" },
    });
    await prisma.classTeacher.create({
      data: { classId: source.id, subjectId: subject.id, teacherUserId: leaver.id, academicYearId: fromYearId },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    const result = await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(result).toEqual({ cloned: 0, skippedInactive: 1 });
    expect(await prisma.classTeacher.count({ where: { academicYearId: toYearId } })).toBe(0);
  });

  it("is idempotent", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
    const teacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000203", role: "teacher", name: "Maths Teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId: source.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: fromYearId },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(await prisma.classTeacher.count({ where: { academicYearId: toYearId } })).toBe(1);
  });
});
