import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import {
  cloneClasses,
  cloneFaculty,
  cloneTimetable,
  cloneFeeStructures,
  runRollover,
} from "../src/lib/promotion/rollover";

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

describe("rollover: timetable", () => {
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

  it("clones timetable entries onto the cloned classes", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
    const teacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000301", role: "teacher", name: "Maths Teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId: source.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: fromYearId },
    });
    const period = await prisma.period.create({
      data: { schoolId, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" },
    });
    await prisma.timetableEntry.create({
      data: {
        classId: source.id,
        academicYearId: fromYearId,
        dayOfWeek: 1,
        periodId: period.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
      },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    const result = await cloneTimetable(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(result).toEqual({ cloned: 1, skippedNoTeacher: 0 });

    const cloned = await prisma.timetableEntry.findFirstOrThrow({ where: { academicYearId: toYearId } });
    expect(cloned.classId).toBe(classMap.get(source.id));
    expect(cloned.periodId).toBe(period.id);
    expect(cloned.dayOfWeek).toBe(1);
    expect(cloned.teacherUserId).toBe(teacher.id);
  });

  it("clears the teacher when their assignment did not carry forward", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
    const leaver = await prisma.user.create({
      data: { schoolId, phone: "+10000000302", role: "teacher", name: "Departed", status: "inactive" },
    });
    await prisma.classTeacher.create({
      data: { classId: source.id, subjectId: subject.id, teacherUserId: leaver.id, academicYearId: fromYearId },
    });
    const period = await prisma.period.create({
      data: { schoolId, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" },
    });
    await prisma.timetableEntry.create({
      data: {
        classId: source.id,
        academicYearId: fromYearId,
        dayOfWeek: 1,
        periodId: period.id,
        subjectId: subject.id,
        teacherUserId: leaver.id,
      },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    const result = await cloneTimetable(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(result).toEqual({ cloned: 1, skippedNoTeacher: 1 });

    const cloned = await prisma.timetableEntry.findFirstOrThrow({ where: { academicYearId: toYearId } });
    expect(cloned.teacherUserId).toBeNull();
  });

  it("is idempotent", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
    const teacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000303", role: "teacher", name: "Maths Teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId: source.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: fromYearId },
    });
    const period = await prisma.period.create({
      data: { schoolId, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" },
    });
    await prisma.timetableEntry.create({
      data: {
        classId: source.id,
        academicYearId: fromYearId,
        dayOfWeek: 1,
        periodId: period.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
      },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneTimetable(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneTimetable(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(await prisma.timetableEntry.count({ where: { academicYearId: toYearId } })).toBe(1);
  });
});

describe("rollover: fee structures", () => {
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

  it("clones fee structures with their due dates shifted by a year", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    await prisma.feeStructure.create({
      data: { schoolId, academicYearId: fromYearId, classId: source.id, term: "Term 1", amount: 5000, dueDate: new Date("2026-06-01") },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    const result = await cloneFeeStructures(prisma, { schoolId, classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(result).toEqual({ cloned: 1 });

    const cloned = await prisma.feeStructure.findFirstOrThrow({ where: { academicYearId: toYearId } });
    expect(cloned.term).toBe("Term 1");
    expect(Number(cloned.amount)).toBe(5000);
    expect(cloned.dueDate.toISOString().slice(0, 10)).toBe("2027-06-01");
  });

  it("carries discount and fineAmount forward unchanged", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    await prisma.feeStructure.create({
      data: {
        schoolId,
        academicYearId: fromYearId,
        classId: source.id,
        term: "Term 1",
        amount: 5000,
        discount: 250,
        fineAmount: 100,
        dueDate: new Date("2026-06-01"),
      },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneFeeStructures(prisma, { schoolId, classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    const cloned = await prisma.feeStructure.findFirstOrThrow({ where: { academicYearId: toYearId } });
    expect(Number(cloned.discount)).toBe(250);
    expect(Number(cloned.fineAmount)).toBe(100);
  });

  it("is idempotent", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    await prisma.feeStructure.create({
      data: { schoolId, academicYearId: fromYearId, classId: source.id, term: "Term 1", amount: 5000, dueDate: new Date("2026-06-01") },
    });

    const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneFeeStructures(prisma, { schoolId, classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneFeeStructures(prisma, { schoolId, classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(await prisma.feeStructure.count({ where: { academicYearId: toYearId } })).toBe(1);
  });
});

describe("runRollover", () => {
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

  async function seedSourceYear() {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
    const teacher = await prisma.user.create({
      data: { schoolId, phone: "+10000000401", role: "teacher", name: "Maths Teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId: source.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: fromYearId, isClassTeacher: true },
    });
    const period = await prisma.period.create({
      data: { schoolId, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" },
    });
    await prisma.timetableEntry.create({
      data: {
        classId: source.id,
        academicYearId: fromYearId,
        dayOfWeek: 1,
        periodId: period.id,
        subjectId: subject.id,
        teacherUserId: teacher.id,
      },
    });
    await prisma.feeStructure.create({
      data: { schoolId, academicYearId: fromYearId, classId: source.id, term: "Term 1", amount: 5000, dueDate: new Date("2026-06-01") },
    });
    return { source, subject, teacher, period };
  }

  it("honours per-entity opt-out", async () => {
    await seedSourceYear();

    const summary = await runRollover(prisma, {
      schoolId,
      fromAcademicYearId: fromYearId,
      toAcademicYearId: toYearId,
      options: { classes: true, faculty: true, timetable: false, feeStructures: false },
    });

    expect(summary.classes).toBeGreaterThan(0);
    expect(summary.faculty.cloned).toBeGreaterThan(0);
    expect(await prisma.timetableEntry.count({ where: { academicYearId: toYearId } })).toBe(0);
    expect(await prisma.feeStructure.count({ where: { academicYearId: toYearId } })).toBe(0);
  });

  it("does nothing at all when every option is off", async () => {
    await seedSourceYear();

    const summary = await runRollover(prisma, {
      schoolId,
      fromAcademicYearId: fromYearId,
      toAcademicYearId: toYearId,
      options: { classes: false, faculty: false, timetable: false, feeStructures: false },
    });

    expect(summary.classes).toBe(0);
    expect(await prisma.class.count({ where: { academicYearId: toYearId } })).toBe(0);
  });

  it("clones everything when every option is on", async () => {
    await seedSourceYear();

    const summary = await runRollover(prisma, {
      schoolId,
      fromAcademicYearId: fromYearId,
      toAcademicYearId: toYearId,
      options: { classes: true, faculty: true, timetable: true, feeStructures: true },
    });

    expect(summary.classes).toBe(1);
    expect(summary.faculty).toEqual({ cloned: 1, skippedInactive: 0 });
    expect(summary.timetable).toEqual({ cloned: 1, skippedNoTeacher: 0 });
    expect(summary.feeStructures).toBe(1);
  });
});

describe("rollover: revert interaction", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("survives a revert of the promotion that created it, which the YEAR_HAS_ACTIVITY guard then blocks", async () => {
    const { startOrResumePromotionRun, updateMappings, setStudentDecisions, confirmPromotionRun, revertPromotionRun } =
      await import("../src/lib/promotion");

    const school = await prisma.school.create({ data: { name: "Revert Interaction School" } });
    const fromYear = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });
    const toYear = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
    });
    const admin = await prisma.user.create({
      data: { schoolId: school.id, phone: "+10000000501", role: "admin", name: "Test Admin" },
    });
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 1" } });
    const source = await prisma.class.create({
      data: { schoolId: school.id, gradeId: grade.id, section: "A", academicYearId: fromYear.id },
    });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Mathematics" } });
    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+10000000502", role: "teacher", name: "Maths Teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId: source.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: fromYear.id, isClassTeacher: true },
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Student One", dob: new Date("2016-01-01"), admissionNo: "REV-1" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: source.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    if (!started.ok) throw new Error("setup failed");

    await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: started.mappings.map((m) => ({ fromClassId: m.fromClassId, toClassId: null })),
    });
    await setStudentDecisions(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      decisions: [{ studentId: student.id, action: "graduated" }],
    });

    const confirmResult = await confirmPromotionRun(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      rollover: { classes: true, faculty: true, timetable: true, feeStructures: true },
    });
    expect(confirmResult.ok).toBe(true);
    if (confirmResult.ok) {
      expect(confirmResult.rollover).toMatchObject({
        classes: 1,
        faculty: { cloned: 1 },
      });
    }

    // Rollover created faculty and timetable rows in the target year regardless
    // of the student decisions above.
    expect(await prisma.class.count({ where: { academicYearId: toYear.id } })).toBeGreaterThan(0);
    expect(await prisma.classTeacher.count({ where: { academicYearId: toYear.id } })).toBeGreaterThan(0);

    // Reverting is refused: rollover's ClassTeacher/TimetableEntry rows in the
    // target year are exactly what the YEAR_HAS_ACTIVITY guard counts, so once
    // rollover has set up the new year, an automatic revert is no longer safe.
    // This is deliberate -- do not weaken the guard to make rollover revertible.
    const revertResult = await revertPromotionRun(prisma, { promotionRunId: started.id, schoolId: school.id });
    expect(revertResult).toEqual({ ok: false, error: "YEAR_HAS_ACTIVITY" });

    // The rollover-created rows survive the (refused) revert attempt untouched.
    expect(await prisma.class.count({ where: { academicYearId: toYear.id } })).toBeGreaterThan(0);
    expect(await prisma.classTeacher.count({ where: { academicYearId: toYear.id } })).toBeGreaterThan(0);
  });
});
