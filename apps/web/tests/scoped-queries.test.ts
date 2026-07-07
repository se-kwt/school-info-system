import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getStudentsForParent, getClassesForTeacher } from "../src/lib/data/scoped-queries";

describe("scoped queries", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns only the students linked to a given parent", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const students = await getStudentsForParent(prisma, fixtures.parent.id);

    expect(students).toHaveLength(1);
    expect(students[0].id).toBe(fixtures.student.id);
  });

  it("returns an empty array for a parent with no linked students", async () => {
    const school = await prisma.school.create({ data: { name: "Other School" } });
    const otherParent = await prisma.user.create({
      data: { phone: "+15559990000", role: "parent", name: "No Kids", schoolId: school.id },
    });

    const students = await getStudentsForParent(prisma, otherParent.id);
    expect(students).toEqual([]);
  });

  it("returns only the classes a given teacher is assigned to", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const classes = await getClassesForTeacher(prisma, fixtures.teacher.id, fixtures.academicYear.id);

    expect(classes).toHaveLength(1);
    expect(classes[0].id).toBe(fixtures.classA.id);
  });
});
