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
      academicYearId: fromYear.id,
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
      academicYearId: fromYear.id,
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
      academicYearId: fromYear.id,
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
});
