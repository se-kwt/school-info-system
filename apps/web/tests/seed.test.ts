import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";

describe("seed fixtures", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("creates a school with linked classes, staff, parent, and student", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const studentWithParents = await prisma.student.findUniqueOrThrow({
      where: { id: fixtures.student.id },
      include: { parentLinks: { include: { parent: true } } },
    });

    expect(studentWithParents.parentLinks).toHaveLength(1);
    expect(studentWithParents.parentLinks[0].parent.phone).toBe("+10000000004");

    const classWithTeacher = await prisma.class.findUniqueOrThrow({
      where: { id: fixtures.classA.id },
      include: { teacherLinks: true },
    });
    expect(classWithTeacher.teacherLinks).toHaveLength(1);
  });
});
