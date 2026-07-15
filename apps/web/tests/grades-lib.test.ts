import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { listGrades, createGrade, editGrade, deleteGrade } from "../src/lib/school-setup/grades";

describe("grades lib", () => {
  let schoolId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
  });

  it("creates and lists grades", async () => {
    const created = await createGrade(prisma, schoolId, { name: "Grade 1" });
    expect(created.ok).toBe(true);

    const grades = await listGrades(prisma, schoolId);
    expect(grades).toEqual([{ id: expect.any(Number), name: "Grade 1", subjectCount: 0, classCount: 0 }]);
  });

  it("rejects duplicate grade names within a school", async () => {
    await createGrade(prisma, schoolId, { name: "Grade 1" });
    const duplicate = await createGrade(prisma, schoolId, { name: "Grade 1" });
    expect(duplicate).toEqual({ ok: false, error: "DUPLICATE" });
  });

  it("edits a grade name", async () => {
    const created = await createGrade(prisma, schoolId, { name: "Grade 1" });
    if (!created.ok) throw new Error("setup failed");
    const result = await editGrade(prisma, { gradeId: created.grade.id, schoolId, name: "Grade One" });
    expect(result).toEqual({ ok: true });
  });

  it("blocks deleting a grade that has classes", async () => {
    const created = await createGrade(prisma, schoolId, { name: "Grade 1" });
    if (!created.ok) throw new Error("setup failed");
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date(), endDate: new Date(), status: "active" },
    });
    await prisma.class.create({
      data: { schoolId, section: "A", gradeId: created.grade.id, academicYearId: year.id },
    });

    const result = await deleteGrade(prisma, { gradeId: created.grade.id, schoolId });
    expect(result).toEqual({ ok: false, error: "HAS_HISTORY" });
  });

  it("returns NOT_FOUND when editing a non-existent grade", async () => {
    const result = await editGrade(prisma, { gradeId: 9999, schoolId, name: "Grade X" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects renaming a grade to an existing name", async () => {
    await createGrade(prisma, schoolId, { name: "Grade 1" });
    const g2 = await createGrade(prisma, schoolId, { name: "Grade 2" });
    if (!g2.ok) throw new Error("setup failed");
    const result = await editGrade(prisma, { gradeId: g2.grade.id, schoolId, name: "Grade 1" });
    expect(result).toEqual({ ok: false, error: "DUPLICATE" });
  });

  it("returns NOT_FOUND when deleting a non-existent grade", async () => {
    const result = await deleteGrade(prisma, { gradeId: 9999, schoolId });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("deletes a grade with no associations", async () => {
    const created = await createGrade(prisma, schoolId, { name: "Grade 1" });
    if (!created.ok) throw new Error("setup failed");
    const result = await deleteGrade(prisma, { gradeId: created.grade.id, schoolId });
    expect(result).toEqual({ ok: true, deleted: true });
  });

  it("blocks deleting a grade that has subjects", async () => {
    const created = await createGrade(prisma, schoolId, { name: "Grade 1" });
    if (!created.ok) throw new Error("setup failed");
    await prisma.subject.create({
      data: { gradeId: created.grade.id, name: "Mathematics" },
    });

    const result = await deleteGrade(prisma, { gradeId: created.grade.id, schoolId });
    expect(result).toEqual({ ok: false, error: "HAS_HISTORY" });
  });

  it("allows same grade name in different schools", async () => {
    const school2 = await prisma.school.create({ data: { name: "Other School" } });
    await createGrade(prisma, schoolId, { name: "Grade 1" });
    const result = await createGrade(prisma, school2.id, { name: "Grade 1" });
    expect(result.ok).toBe(true);
  });
});
