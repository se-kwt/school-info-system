import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { listTimetableEntries, createTimetableEntry } from "../src/lib/timetable";

describe("timetable lib", () => {
  let schoolId: number;
  let classId: number;
  let subjectId: number;
  let periodId: number;
  let teacherId: number;
  let yearId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Test School" } });
    schoolId = school.id;
    const teacher = await prisma.user.create({ data: { schoolId, phone: "+10000000001", role: "teacher", name: "Teacher One" } });
    teacherId = teacher.id;
    const otherTeacher = await prisma.user.create({ data: { schoolId, phone: "+10000000002", role: "teacher", name: "Teacher Two" } });
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Mathematics" } });
    subjectId = subject.id;
    const period = await prisma.period.create({ data: { schoolId, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" } });
    periodId = period.id;
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date(), endDate: new Date(), status: "active" },
    });
    yearId = year.id;
    const klass = await prisma.class.create({ data: { schoolId, section: "A", gradeId: grade.id, academicYearId: year.id } });
    classId = klass.id;
    await prisma.classTeacher.create({ data: { classId, subjectId, teacherUserId: teacherId, academicYearId: yearId } });
    void otherTeacher;
  });

  it("creates a timetable entry with an assigned subject-teacher", async () => {
    const result = await createTimetableEntry(prisma, {
      schoolId, academicYearId: yearId, classId, dayOfWeek: 1, periodId, subjectId, teacherUserId: teacherId,
    });
    expect(result.ok).toBe(true);

    const list = await listTimetableEntries(prisma, { classId, schoolId, academicYearId: yearId, role: "admin", userId: 0 });
    if (!list.ok) throw new Error("expected ok");
    expect(list.entries).toEqual([
      { id: expect.any(Number), dayOfWeek: 1, periodId, periodOrder: 1, periodLabel: "Period 1", subjectId, subjectName: "Mathematics", teacherUserId: teacherId, teacherName: "Teacher One" },
    ]);
  });

  it("rejects a teacher who isn't assigned to that subject on that class", async () => {
    const unassigned = await prisma.user.create({ data: { schoolId, phone: "+10000000003", role: "teacher", name: "Unassigned" } });
    const result = await createTimetableEntry(prisma, {
      schoolId, academicYearId: yearId, classId, dayOfWeek: 1, periodId, subjectId, teacherUserId: unassigned.id,
    });
    expect(result).toEqual({ ok: false, error: "INVALID_TEACHER" });
  });
});
