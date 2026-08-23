import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";

describe("schema timestamps", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stamps createdAt and updatedAt on a Student", async () => {
    const school = await prisma.school.create({ data: { name: "Timestamp School" } });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test", dob: new Date("2015-01-01"), admissionNo: "TS-001" },
    });

    expect(student.createdAt).toBeInstanceOf(Date);
    expect(student.updatedAt).toBeInstanceOf(Date);
  });

  it("advances updatedAt on modification but leaves createdAt alone", async () => {
    const school = await prisma.school.create({ data: { name: "Timestamp School" } });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test", dob: new Date("2015-01-01"), admissionNo: "TS-002" },
    });

    await new Promise((r) => setTimeout(r, 10));
    const updated = await prisma.student.update({
      where: { id: student.id },
      data: { name: "Renamed" },
    });

    expect(updated.createdAt.getTime()).toBe(student.createdAt.getTime());
    expect(updated.updatedAt.getTime()).toBeGreaterThan(student.updatedAt.getTime());
  });

  it("stamps timestamps on every model that can be created standalone", async () => {
    const school = await prisma.school.create({ data: { name: "Coverage School" } });
    expect(school.createdAt).toBeInstanceOf(Date);
    expect(school.updatedAt).toBeInstanceOf(Date);

    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 1" } });
    expect(grade.createdAt).toBeInstanceOf(Date);
    expect(grade.updatedAt).toBeInstanceOf(Date);

    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Maths" } });
    expect(subject.createdAt).toBeInstanceOf(Date);
    expect(subject.updatedAt).toBeInstanceOf(Date);
  });
});
