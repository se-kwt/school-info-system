import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createGrade } from "../src/lib/school-setup/grades";
import {
  listSubjects,
  createSubject,
  deleteSubject,
  listSyllabusVersions,
  createSyllabusVersion,
} from "../src/lib/school-setup/subjects";

describe("subjects lib", () => {
  let schoolId: number;
  let gradeId: number;
  let adminId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const admin = await prisma.user.create({
      data: { schoolId, phone: "+10000000001", role: "admin", name: "Admin" },
    });
    adminId = admin.id;
    const grade = await createGrade(prisma, schoolId, { name: "Grade 1" });
    if (!grade.ok) throw new Error("setup failed");
    gradeId = grade.grade.id;
  });

  it("creates a subject and lists it scoped to its grade", async () => {
    const created = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    expect(created.ok).toBe(true);

    const result = await listSubjects(prisma, { gradeId, schoolId });
    expect(result).toEqual({
      ok: true,
      subjects: [
        {
          id: expect.any(Number),
          name: "Mathematics",
          gradeId,
          versionCount: 0,
          code: null,
          creditHours: null,
          weeklyPeriods: null,
          isPractical: false,
          isElective: false,
        },
      ],
    });
  });

  it("rejects duplicate subject names within a grade", async () => {
    await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    const duplicate = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    expect(duplicate).toEqual({ ok: false, error: "DUPLICATE" });
  });

  it("adds sequential syllabus versions and lists them newest first", async () => {
    const created = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    if (!created.ok) throw new Error("setup failed");

    await createSyllabusVersion(prisma, {
      subjectId: created.subject.id,
      schoolId,
      title: "v1",
      content: "Numbers",
      createdById: adminId,
    });
    await createSyllabusVersion(prisma, {
      subjectId: created.subject.id,
      schoolId,
      title: "v2",
      content: "Numbers and shapes",
      createdById: adminId,
    });

    const result = await listSyllabusVersions(prisma, { subjectId: created.subject.id, schoolId });
    if (!result.ok) throw new Error("expected ok");
    expect(result.versions.map((v) => v.versionNum)).toEqual([2, 1]);
  });

  it("reports versionCount on listed subjects", async () => {
    const created = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    if (!created.ok) throw new Error("setup failed");
    expect(created.subject.versionCount).toBe(0);

    await createSyllabusVersion(prisma, {
      subjectId: created.subject.id,
      schoolId,
      title: "v1",
      content: "Numbers",
      createdById: adminId,
    });

    const afterOne = await listSubjects(prisma, { gradeId, schoolId });
    if (!afterOne.ok) throw new Error("expected ok");
    expect(afterOne.subjects[0].versionCount).toBe(1);

    await createSyllabusVersion(prisma, {
      subjectId: created.subject.id,
      schoolId,
      title: "v2",
      content: "Numbers and shapes",
      createdById: adminId,
    });

    const afterTwo = await listSubjects(prisma, { gradeId, schoolId });
    if (!afterTwo.ok) throw new Error("expected ok");
    expect(afterTwo.subjects[0].versionCount).toBe(2);
  });

  it("blocks deleting a subject that has syllabus history", async () => {
    const created = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    if (!created.ok) throw new Error("setup failed");
    await createSyllabusVersion(prisma, {
      subjectId: created.subject.id,
      schoolId,
      title: "v1",
      content: "Numbers",
      createdById: adminId,
    });

    const result = await deleteSubject(prisma, { subjectId: created.subject.id, schoolId });
    expect(result).toEqual({ ok: false, error: "HAS_HISTORY" });
  });

  it("marks the newest syllabus version as current and clears the previous one", async () => {
    const created = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    if (!created.ok) throw new Error("setup failed");
    const subjectId = created.subject.id;

    const first = await createSyllabusVersion(prisma, { subjectId, schoolId, title: "V1", content: "...", createdById: adminId });
    expect(first.ok).toBe(true);

    const second = await createSyllabusVersion(prisma, { subjectId, schoolId, title: "V2", content: "...", createdById: adminId });
    expect(second.ok).toBe(true);

    const versions = await prisma.syllabusVersion.findMany({ where: { subjectId }, orderBy: { versionNum: "asc" } });
    expect(versions[0].isCurrent).toBe(false);
    expect(versions[1].isCurrent).toBe(true);

    const listed = await listSyllabusVersions(prisma, { subjectId, schoolId });
    if (!listed.ok) throw new Error("expected ok");
    const listedByVersionNum = new Map(listed.versions.map((v) => [v.versionNum, v.isCurrent]));
    expect(listedByVersionNum.get(1)).toBe(false);
    expect(listedByVersionNum.get(2)).toBe(true);
  });

  it("stores and reads back code, creditHours, weeklyPeriods, isPractical, isElective on a subject", async () => {
    const created = await createSubject(prisma, {
      gradeId,
      schoolId,
      name: "Physics Lab",
      code: "PHY-LAB",
      creditHours: 2.5,
      weeklyPeriods: 3,
      isPractical: true,
      isElective: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const stored = await prisma.subject.findUniqueOrThrow({ where: { id: created.subject.id } });
    expect(stored.code).toBe("PHY-LAB");
    expect(stored.creditHours).toBe(2.5);
    expect(stored.weeklyPeriods).toBe(3);
    expect(stored.isPractical).toBe(true);
    expect(stored.isElective).toBe(true);
  });

  it("stores and reads back effectiveFrom on a syllabus version", async () => {
    const created = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    if (!created.ok) throw new Error("setup failed");

    const version = await createSyllabusVersion(prisma, {
      subjectId: created.subject.id,
      schoolId,
      title: "v1",
      content: "Numbers",
      createdById: adminId,
      effectiveFrom: "2026-06-01",
    });
    expect(version.ok).toBe(true);
    if (!version.ok) return;

    const stored = await prisma.syllabusVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(stored.effectiveFrom?.toISOString().slice(0, 10)).toBe("2026-06-01");
  });
});
