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
      subjects: [{ id: expect.any(Number), name: "Mathematics", gradeId, versionCount: 0 }],
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

    const result = await listSubjects(prisma, { gradeId, schoolId });
    if (!result.ok) throw new Error("expected ok");
    expect(result.subjects[0].versionCount).toBe(1);
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
});
