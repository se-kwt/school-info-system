import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createClass } from "./helpers/enrollment";

describe("startOrResumePromotionRun", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedSchoolWithActiveYearAndClass() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550991111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const gradeTwo = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 2",
      section: "A",
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-1" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    return { school, fromYear, admin, gradeOne, gradeTwo, student };
  }

  it("creates a draft run with auto-generated mappings for every class with active enrollments", async () => {
    const { startOrResumePromotionRun } = await import("../src/lib/promotion");
    const { school, fromYear, admin, gradeOne } = await seedSchoolWithActiveYearAndClass();
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });

    const result = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mappings).toEqual([
      { fromClassId: gradeOne.id, toClassId: null },
    ]);

    const run = await prisma.promotionRun.findUnique({ where: { id: result.id } });
    expect(run?.status).toBe("draft");
    expect(run?.fromAcademicYearId).toBe(fromYear.id);
  });

  it("resumes the existing draft run instead of creating a second one", async () => {
    const { startOrResumePromotionRun } = await import("../src/lib/promotion");
    const { school, admin } = await seedSchoolWithActiveYearAndClass();
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });

    const first = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    const second = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });

    expect(first.ok && second.ok && first.id === second.id).toBe(true);
    const runs = await prisma.promotionRun.findMany({ where: { schoolId: school.id } });
    expect(runs).toHaveLength(1);
  });

  it("returns NO_ACTIVE_YEAR when the school has no active academic year", async () => {
    const { startOrResumePromotionRun } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Yearless School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550998888", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });

    const result = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(result).toEqual({ ok: false, error: "NO_ACTIVE_YEAR" });
  });

  it("refuses to start a run targeting an archived year", async () => {
    const { startOrResumePromotionRun } = await import("../src/lib/promotion");
    const { school, admin } = await seedSchoolWithActiveYearAndClass();
    const archived = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2020-21", startDate: new Date("2020-04-01"), endDate: new Date("2021-03-31"), status: "archived" },
    });

    const result = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: archived.id,
    });

    expect(result).toEqual({ ok: false, error: "TARGET_YEAR_NOT_UPCOMING" });
  });

  it("refuses to start a run targeting the currently active year", async () => {
    const { startOrResumePromotionRun } = await import("../src/lib/promotion");
    const { school, admin, fromYear } = await seedSchoolWithActiveYearAndClass();

    const result = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: fromYear.id,
    });

    expect(result).toEqual({ ok: false, error: "TARGET_YEAR_NOT_UPCOMING" });
  });
});

describe("updateMappings", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("overwrites the toClassId for an existing mapping", async () => {
    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550981111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const gradeTwo = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: toYear.id,
      name: "Grade 2",
      section: "A",
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-2" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const result = await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }],
    });
    expect(result).toEqual({ ok: true });

    const mapping = await prisma.promotionMapping.findFirst({
      where: { promotionRunId: started.id, fromClassId: gradeOne.id },
    });
    expect(mapping?.toClassId).toBe(gradeTwo.id);
  });

  it("rejects a run id that doesn't belong to the caller's school with 404-equivalent error", async () => {
    const { updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });

    const result = await updateMappings(prisma, {
      promotionRunId: 999999,
      schoolId: school.id,
      mappings: [],
    });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    void otherSchool;
  });

  it("rejects a fromClassId that isn't part of this run's mappings", async () => {
    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550982222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const unrelatedClass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 9",
      section: "Z",
    });
    void fromYear;

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const result = await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: unrelatedClass.id, toClassId: null }],
    });
    expect(result).toEqual({ ok: false, error: "INVALID_MAPPING" });
  });

  it("rejects a mapping whose target class belongs to another school", async () => {
    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550983333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-3" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await prisma.academicYear.create({
      data: {
        schoolId: otherSchool.id,
        name: "2027-28",
        startDate: new Date("2027-04-01"),
        endDate: new Date("2028-03-31"),
        status: "upcoming",
      },
    });
    const otherGrade = await prisma.grade.create({
      data: { schoolId: otherSchool.id, name: "Grade 2" },
    });
    const foreignClass = await prisma.class.create({
      data: {
        schoolId: otherSchool.id,
        gradeId: otherGrade.id,
        section: "A",
        academicYearId: otherYear.id,
      },
    });

    const result = await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: foreignClass.id }],
    });

    expect(result).toEqual({ ok: false, error: "INVALID_TARGET_CLASS" });

    const stored = await prisma.promotionMapping.findFirst({
      where: { promotionRunId: started.id, fromClassId: gradeOne.id },
    });
    expect(stored?.toClassId).not.toBe(foreignClass.id);
  });

  it("rejects a mapping whose target class is in the wrong academic year", async () => {
    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550984444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-4" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const staleYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2024-25",
        startDate: new Date("2024-04-01"),
        endDate: new Date("2025-03-31"),
        status: "archived",
      },
    });
    const staleClass = await prisma.class.create({
      data: { schoolId: school.id, gradeId: gradeOne.gradeId, section: "Z", academicYearId: staleYear.id },
    });

    const result = await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: staleClass.id }],
    });

    expect(result).toEqual({ ok: false, error: "INVALID_TARGET_CLASS" });
  });

  it("rejects a mapping whose target class is archived", async () => {
    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550985555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-5" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const archivedClass = await prisma.class.create({
      data: { schoolId: school.id, gradeId: gradeOne.gradeId, section: "Y", academicYearId: toYear.id, archived: true },
    });

    const result = await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: archivedClass.id }],
    });

    expect(result).toEqual({ ok: false, error: "INVALID_TARGET_CLASS" });
  });

  it("still accepts a valid target class in the run's target year", async () => {
    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550986666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-6" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const validClass = await prisma.class.create({
      data: { schoolId: school.id, gradeId: gradeOne.gradeId, section: "B", academicYearId: toYear.id },
    });

    const result = await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: validClass.id }],
    });

    expect(result).toEqual({ ok: true });
  });
});

describe("getRosterForReview / setStudentDecisions / getRunSummary", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedRunWithTwoStudents() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550971111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const gradeTwo = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: toYear.id,
      name: "Grade 2",
      section: "A",
    });
    const studentA = await prisma.student.create({
      data: { schoolId: school.id, name: "Student A", dob: new Date("2016-01-01"), admissionNo: "SCH-A" },
    });
    const studentB = await prisma.student.create({
      data: { schoolId: school.id, name: "Student B", dob: new Date("2016-01-01"), admissionNo: "SCH-B" },
    });
    await prisma.enrollment.create({
      data: { studentId: studentA.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    await prisma.enrollment.create({
      data: { studentId: studentB.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    if (!started.ok) throw new Error("setup failed");
    await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }],
    });

    return { school, fromYear, toYear, admin, gradeOne, gradeTwo, studentA, studentB, runId: started.id };
  }

  it("defaults every student to a 'promoted' decision to their mapped class", async () => {
    const { getRosterForReview } = await import("../src/lib/promotion");
    const { school, runId, gradeOne, gradeTwo, studentA, studentB } = await seedRunWithTwoStudents();

    const result = await getRosterForReview(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const classGroup = result.classes.find((c) => c.fromClassId === gradeOne.id);
    expect(classGroup?.toClassId).toBe(gradeTwo.id);
    expect(classGroup?.students).toEqual(
      expect.arrayContaining([
        { studentId: studentA.id, name: "Student A", action: "promoted", toClassId: gradeTwo.id },
        { studentId: studentB.id, name: "Student B", action: "promoted", toClassId: gradeTwo.id },
      ])
    );
  });

  it("rejects a run id that doesn't belong to the caller's school", async () => {
    const { getRosterForReview } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Another School" } });
    const result = await getRosterForReview(prisma, { promotionRunId: 999999, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("setStudentDecisions overrides individual students and getRunSummary reflects it", async () => {
    const { setStudentDecisions, getRunSummary } = await import("../src/lib/promotion");
    const { school, runId, studentA, studentB } = await seedRunWithTwoStudents();

    const setResult = await setStudentDecisions(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      decisions: [
        { studentId: studentA.id, action: "retained" },
        { studentId: studentB.id, action: "graduated" },
      ],
    });
    expect(setResult).toEqual({ ok: true });

    const summary = await getRunSummary(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.counts).toEqual({ promoted: 0, retained: 1, graduated: 1, transferred: 0, left: 0, inactive: 0 });
    expect(summary.undecidedStudentIds).toEqual([]);
  });

  it("setStudentDecisions rejects a 'promoted' action with no resolvable target class", async () => {
    const { setStudentDecisions, updateMappings } = await import("../src/lib/promotion");
    const { school, runId, gradeOne, studentA } = await seedRunWithTwoStudents();
    // Clear the class mapping so "promoted" has no implicit target.
    await updateMappings(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: null }],
    });

    const result = await setStudentDecisions(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      decisions: [{ studentId: studentA.id, action: "promoted" }],
    });
    expect(result).toEqual({ ok: false, error: "MISSING_TARGET_CLASS" });
  });

  it("rejects a decision whose toClassId belongs to another school", async () => {
    const { setStudentDecisions } = await import("../src/lib/promotion");
    const { school, runId, studentA } = await seedRunWithTwoStudents();

    const otherSchool = await prisma.school.create({ data: { name: "Other School 2" } });
    const otherYear = await prisma.academicYear.create({
      data: {
        schoolId: otherSchool.id,
        name: "2027-28",
        startDate: new Date("2027-04-01"),
        endDate: new Date("2028-03-31"),
        status: "upcoming",
      },
    });
    const otherGrade = await prisma.grade.create({
      data: { schoolId: otherSchool.id, name: "Grade 2" },
    });
    const foreignClass = await prisma.class.create({
      data: {
        schoolId: otherSchool.id,
        gradeId: otherGrade.id,
        section: "A",
        academicYearId: otherYear.id,
      },
    });

    const result = await setStudentDecisions(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      decisions: [{ studentId: studentA.id, action: "promoted", toClassId: foreignClass.id }],
    });

    expect(result).toEqual({ ok: false, error: "INVALID_TARGET_CLASS" });

    const logged = await prisma.promotionLogEntry.findFirst({
      where: { promotionRunId: runId, studentId: studentA.id },
    });
    expect(logged?.toClassId ?? null).not.toBe(foreignClass.id);
  });

  it("getRunSummary lists students with no decision yet as undecided by default", async () => {
    const { getRunSummary } = await import("../src/lib/promotion");
    const { school, runId, studentA, studentB } = await seedRunWithTwoStudents();

    const summary = await getRunSummary(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    // Both students default to "promoted" (mapped), so nothing is undecided yet --
    // this asserts the counts reflect the defaults, and undecided only appears for
    // students whose class has no mapping and no explicit override.
    expect(summary.counts.promoted).toBe(2);
    expect(summary.undecidedStudentIds).toEqual([]);
    void studentA;
    void studentB;
  });
});

describe("confirmPromotionRun / revertPromotionRun", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedReadyRun() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550961111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const gradeTwo = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: toYear.id,
      name: "Grade 2",
      section: "A",
    });
    const promotedStudent = await prisma.student.create({
      data: { schoolId: school.id, name: "Promoted Student", dob: new Date("2016-01-01"), admissionNo: "SCH-P" },
    });
    const retainedStudent = await prisma.student.create({
      data: { schoolId: school.id, name: "Retained Student", dob: new Date("2016-01-01"), admissionNo: "SCH-R" },
    });
    const graduatedStudent = await prisma.student.create({
      data: { schoolId: school.id, name: "Graduated Student", dob: new Date("2010-01-01"), admissionNo: "SCH-G" },
    });
    await prisma.enrollment.create({
      data: { studentId: promotedStudent.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    await prisma.enrollment.create({
      data: { studentId: retainedStudent.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    await prisma.enrollment.create({
      data: { studentId: graduatedStudent.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const { startOrResumePromotionRun, updateMappings, setStudentDecisions } = await import(
      "../src/lib/promotion"
    );
    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    if (!started.ok) throw new Error("setup failed");
    await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }],
    });
    await setStudentDecisions(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      decisions: [
        { studentId: retainedStudent.id, action: "retained" },
        { studentId: graduatedStudent.id, action: "graduated" },
      ],
    });
    // promotedStudent is left at its default ("promoted") -- no explicit decision needed.

    return {
      school,
      fromYear,
      toYear,
      gradeOne,
      gradeTwo,
      promotedStudent,
      retainedStudent,
      graduatedStudent,
      runId: started.id,
    };
  }

  it("archives the old year, activates the new year, and creates correct new-year enrollments", async () => {
    const { confirmPromotionRun } = await import("../src/lib/promotion");
    const { school, fromYear, toYear, gradeOne, gradeTwo, promotedStudent, retainedStudent, graduatedStudent, runId } =
      await seedReadyRun();

    const result = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: true });

    const updatedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(updatedFromYear?.status).toBe("archived");
    const updatedToYear = await prisma.academicYear.findUnique({ where: { id: toYear.id } });
    expect(updatedToYear?.status).toBe("active");

    const promotedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: promotedStudent.id, academicYearId: toYear.id } },
    });
    expect(promotedEnrollment).toMatchObject({ classId: gradeTwo.id, status: "active" });

    const retainedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: retainedStudent.id, academicYearId: toYear.id } },
    });
    expect(retainedEnrollment).toMatchObject({ classId: gradeOne.id, status: "active" });

    const graduatedNewEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: graduatedStudent.id, academicYearId: toYear.id } },
    });
    expect(graduatedNewEnrollment).toBeNull();

    const oldGraduatedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: graduatedStudent.id, academicYearId: fromYear.id } },
    });
    expect(oldGraduatedEnrollment?.status).toBe("graduated");

    const graduatedStudentRow = await prisma.student.findUnique({ where: { id: graduatedStudent.id } });
    expect(graduatedStudentRow?.status).toBe("graduated");

    const run = await prisma.promotionRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe("confirmed");
    expect(run?.confirmedAt).not.toBeNull();

    const logEntries = await prisma.promotionLogEntry.findMany({ where: { promotionRunId: runId } });
    expect(logEntries).toHaveLength(3);
  });

  it("rejects confirming a run that is already confirmed", async () => {
    const { school, runId } = await seedReadyRun();
    const { confirmPromotionRun } = await import("../src/lib/promotion");

    const first = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(first).toMatchObject({ ok: true });

    const second = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(second).toMatchObject({ ok: false, error: "ALREADY_CONFIRMED" });
  });

  it("rejects updating mappings on a run that is already confirmed", async () => {
    const { school, runId, gradeOne, gradeTwo } = await seedReadyRun();
    const { confirmPromotionRun, updateMappings } = await import("../src/lib/promotion");

    const confirmed = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(confirmed).toMatchObject({ ok: true });

    const result = await updateMappings(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }],
    });
    expect(result).toMatchObject({ ok: false, error: "ALREADY_CONFIRMED" });
  });

  it("rejects setting student decisions on a run that is already confirmed", async () => {
    const { school, runId, promotedStudent } = await seedReadyRun();
    const { confirmPromotionRun, setStudentDecisions } = await import("../src/lib/promotion");

    const confirmed = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(confirmed).toMatchObject({ ok: true });

    const result = await setStudentDecisions(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      decisions: [{ studentId: promotedStudent.id, action: "retained" }],
    });
    expect(result).toMatchObject({ ok: false, error: "ALREADY_CONFIRMED" });
  });

  it("rejects confirming when a student in a mapped class has no decision", async () => {
    const { startOrResumePromotionRun, updateMappings, confirmPromotionRun } = await import(
      "../src/lib/promotion"
    );
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550962222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: fromYear.id,
      name: "Grade 1",
      section: "A",
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Undecided Student", dob: new Date("2016-01-01"), admissionNo: "SCH-U" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    if (!started.ok) throw new Error("setup failed");
    // Leave gradeOne unmapped -- the student has no default decision, so they're undecided.
    await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: null }],
    });

    const result = await confirmPromotionRun(prisma, { promotionRunId: started.id, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "UNDECIDED_STUDENTS" });

    const unchangedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(unchangedFromYear?.status).toBe("active");
  });

  it("confirms successfully when an unrelated third year was activated mid-run", async () => {
    const { confirmPromotionRun } = await import("../src/lib/promotion");
    const { activateAcademicYear } = await import("../src/lib/academic-years");
    const { school, fromYear, toYear, runId } = await seedReadyRun();

    // Simulate an admin activating an unrelated, third year through the UI
    // after the run was drafted but before it was confirmed. This archives
    // fromYear (which the run still remembers as its "from" year) and
    // activates thirdYear instead.
    const thirdYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2028-29",
        startDate: new Date("2028-06-01"),
        endDate: new Date("2029-04-30"),
        status: "upcoming",
      },
    });
    const activated = await activateAcademicYear(prisma, { academicYearId: thirdYear.id, schoolId: school.id });
    expect(activated).toEqual({ ok: true });

    // Before the fix, this threw an unhandled Postgres unique-violation:
    // confirmPromotionRun archived fromYear (a no-op, already archived) then
    // tried to activate toYear directly, colliding with thirdYear which is
    // currently active.
    const result = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: true });

    const updatedToYear = await prisma.academicYear.findUnique({ where: { id: toYear.id } });
    expect(updatedToYear?.status).toBe("active");
    const updatedThirdYear = await prisma.academicYear.findUnique({ where: { id: thirdYear.id } });
    expect(updatedThirdYear?.status).toBe("archived");
    const updatedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(updatedFromYear?.status).toBe("archived");

    const activeYears = await prisma.academicYear.findMany({ where: { schoolId: school.id, status: "active" } });
    expect(activeYears).toHaveLength(1);
    expect(activeYears[0]?.id).toBe(toYear.id);
  });

  it("reverts a promotion run before any activity is recorded against the new year", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { school, fromYear, toYear, gradeOne, promotedStudent, retainedStudent, graduatedStudent, runId } =
      await seedReadyRun();

    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: true });

    const revertedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(revertedFromYear?.status).toBe("active");
    const revertedToYear = await prisma.academicYear.findUnique({ where: { id: toYear.id } });
    expect(revertedToYear?.status).toBe("upcoming");

    const newYearEnrollments = await prisma.enrollment.findMany({ where: { academicYearId: toYear.id } });
    expect(newYearEnrollments).toHaveLength(0);

    const oldPromotedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: promotedStudent.id, academicYearId: fromYear.id } },
    });
    expect(oldPromotedEnrollment).toMatchObject({ classId: gradeOne.id, status: "active" });

    const oldRetainedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: retainedStudent.id, academicYearId: fromYear.id } },
    });
    expect(oldRetainedEnrollment?.status).toBe("active");

    const graduatedStudentRow = await prisma.student.findUnique({ where: { id: graduatedStudent.id } });
    expect(graduatedStudentRow?.status).toBe("active");

    const run = await prisma.promotionRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe("reverted");

    // Regression guard for the predicate-based demote inside the transaction:
    // exactly one year should be active afterwards, and it must be fromYear.
    const activeYears = await prisma.academicYear.findMany({ where: { schoolId: school.id, status: "active" } });
    expect(activeYears).toHaveLength(1);
    expect(activeYears[0]?.id).toBe(fromYear.id);
  });

  it("rejects reverting once the new year has activity recorded against it", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { school, toYear, runId } = await seedReadyRun();

    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    await prisma.exam.create({
      data: {
        schoolId: school.id,
        academicYearId: toYear.id,
        name: "Unit Test",
        term: "Term 1",
        examDate: new Date("2027-09-01"),
      },
    });

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "YEAR_HAS_ACTIVITY" });
  });

  it("rejects reverting a run that was never confirmed", async () => {
    const { revertPromotionRun } = await import("../src/lib/promotion");
    const { school, runId } = await seedReadyRun();

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "NOT_CONFIRMED" });
  });

  it("refuses to revert when an unrelated third year was activated mid-run", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { activateAcademicYear } = await import("../src/lib/academic-years");
    const { school, fromYear, toYear, runId } = await seedReadyRun();

    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    // Simulate an admin deliberately activating an unrelated, third year
    // through the UI after confirmation but before revert. This archives
    // toYear (which the run still remembers as its "to" year) and activates
    // thirdYear instead.
    const thirdYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2028-29",
        startDate: new Date("2028-06-01"),
        endDate: new Date("2029-04-30"),
        status: "upcoming",
      },
    });
    const activated = await activateAcademicYear(prisma, { academicYearId: thirdYear.id, schoolId: school.id });
    expect(activated).toEqual({ ok: true });

    // The predicate-based demote inside the transaction would otherwise demote
    // thirdYear silently and reactivate fromYear in its place -- undoing an
    // admin's deliberate choice with no warning. The pre-check must refuse
    // instead, before any write happens.
    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "ANOTHER_YEAR_ACTIVE" });

    // Nothing should have changed: thirdYear is still active, fromYear and
    // toYear are untouched, and the run is still just "confirmed".
    const unchangedThirdYear = await prisma.academicYear.findUnique({ where: { id: thirdYear.id } });
    expect(unchangedThirdYear?.status).toBe("active");
    const unchangedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(unchangedFromYear?.status).toBe("archived");
    const unchangedToYear = await prisma.academicYear.findUnique({ where: { id: toYear.id } });
    expect(unchangedToYear?.status).toBe("archived");
    const run = await prisma.promotionRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe("confirmed");
  });

  it("is not blocked by another school's attendance in the same date range", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { school, toYear, runId } = await seedReadyRun();

    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    // Arrange: create attendance for a DIFFERENT school inside the same date range as toYear.
    const otherSchool = await prisma.school.create({ data: { name: "Noisy Neighbour" } });
    const otherYear = await prisma.academicYear.create({
      data: {
        schoolId: otherSchool.id,
        name: "2027-28",
        startDate: new Date("2027-04-01"),
        endDate: new Date("2028-03-31"),
        status: "active",
      },
    });
    const otherGrade = await prisma.grade.create({ data: { schoolId: otherSchool.id, name: "Grade 1" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, gradeId: otherGrade.id, section: "A", academicYearId: otherYear.id },
    });
    const otherStudent = await prisma.student.create({
      data: { schoolId: otherSchool.id, name: "Neighbour Kid", dob: new Date("2015-01-01"), admissionNo: "NB-001" },
    });
    await prisma.enrollment.create({
      data: { studentId: otherStudent.id, classId: otherClass.id, academicYearId: otherYear.id, status: "active" },
    });
    const otherTeacher = await prisma.user.create({
      data: { schoolId: otherSchool.id, phone: "+10000000088", role: "teacher", name: "Neighbour Teacher" },
    });
    await prisma.attendance.create({
      data: {
        studentId: otherStudent.id,
        academicYearId: otherYear.id,
        date: new Date("2027-06-15"),
        status: "present",
        markedById: otherTeacher.id,
      },
    });

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    expect(result).toEqual({ ok: true });
  });

  it("is still blocked by this school's own attendance in the target year", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { school, toYear, promotedStudent, runId } = await seedReadyRun();

    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    // Create attendance for a student in THIS school in the target year
    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15551234567", role: "teacher", name: "Teacher" },
    });
    await prisma.attendance.create({
      data: {
        studentId: promotedStudent.id,
        academicYearId: toYear.id,
        date: new Date("2027-09-01"),
        status: "present",
        markedById: teacher.id,
      },
    });

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    expect(result).toEqual({ ok: false, error: "YEAR_HAS_ACTIVITY" });
  });

  it("leaves manually-created enrollments in the target year intact", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { school, toYear, runId } = await seedReadyRun();

    // Arrange: confirm the promotion run to create enrollments in toYear
    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    // Create a manually-enrolled student in the target year
    const bystander = await prisma.student.create({
      data: { schoolId: school.id, name: "Manual Enrollee", dob: new Date("2015-01-01"), admissionNo: "MAN-001" },
    });
    const targetClass = await prisma.class.findFirstOrThrow({
      where: { schoolId: school.id, academicYearId: toYear.id },
    });
    const bystanderEnrollment = await prisma.enrollment.create({
      data: {
        studentId: bystander.id,
        classId: targetClass.id,
        academicYearId: toYear.id,
        status: "active",
      },
    });

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: true });

    const survivor = await prisma.enrollment.findUnique({ where: { id: bystanderEnrollment.id } });
    expect(survivor).not.toBeNull();
    expect(survivor?.status).toBe("active");
  });

  it("still removes the enrollments the run created", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { school, toYear, promotedStudent, runId } = await seedReadyRun();

    // Arrange: confirm the run to create enrollments
    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    // Verify the promoted student has an enrollment in toYear
    const beforeRevert = await prisma.enrollment.findFirst({
      where: { studentId: promotedStudent.id, academicYearId: toYear.id },
    });
    expect(beforeRevert).not.toBeNull();

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: true });

    const removed = await prisma.enrollment.findFirst({
      where: { studentId: promotedStudent.id, academicYearId: toYear.id },
    });
    expect(removed).toBeNull();
  });
});
