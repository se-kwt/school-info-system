import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { runBackfill } from "../scripts/backfill-grades-subjects-periods";

describe("runBackfill", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a Grade per distinct Class name and relinks classes/subjects", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { schoolId: school.id, phone: "+10000000001", role: "admin", name: "Admin" },
    });
    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+10000000002", role: "teacher", name: "Teacher" },
    });
    const year = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-06-01"), endDate: new Date("2027-04-30"), status: "active" },
    });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 1", section: "A" },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Mathematics", academicYearId: year.id },
    });

    await runBackfill(prisma);

    const grade = await prisma.grade.findFirst({ where: { schoolId: school.id, name: "Grade 1" } });
    expect(grade).not.toBeNull();

    const subject = await prisma.subject.findFirst({ where: { gradeId: grade!.id, name: "Mathematics" } });
    expect(subject).not.toBeNull();

    const relinkedClass = await prisma.class.findFirst({ where: { gradeId: grade!.id, academicYearId: year.id, section: "A" } });
    expect(relinkedClass).not.toBeNull();

    const classTeacher = await prisma.classTeacher.findFirst({ where: { classId: relinkedClass!.id } });
    expect(classTeacher?.subjectRefId).toBe(subject!.id);

    void admin;
  });
});
