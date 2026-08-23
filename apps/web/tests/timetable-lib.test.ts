import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { listTimetableEntries, createTimetableEntry, editTimetableEntry } from "../src/lib/timetable";
import { createActiveYear, createClass } from "./helpers/enrollment";

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

  it("rejects staffing a deactivated teacher onto a timetable slot even though their ClassTeacher link survives deactivation", async () => {
    await prisma.user.update({ where: { id: teacherId }, data: { status: "inactive" } });

    const result = await createTimetableEntry(prisma, {
      schoolId, academicYearId: yearId, classId, dayOfWeek: 1, periodId, subjectId, teacherUserId: teacherId,
    });
    expect(result).toEqual({ ok: false, error: "TEACHER_INACTIVE" });

    const written = await prisma.timetableEntry.count({ where: { classId, teacherUserId: teacherId } });
    expect(written).toBe(0);
  });

  it("rejects editTimetableEntry when the new subjectId doesn't belong to the entry's class's grade", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const gradeA = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade A" } });
    const gradeB = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade B" } });
    const classA = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, gradeId: gradeA.id, section: "A" });
    const subjectInGradeB = await prisma.subject.create({ data: { gradeId: gradeB.id, name: "Foreign Subject" } });
    const period = await prisma.period.create({ data: { schoolId: school.id, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" } });
    const subjectInGradeA = await prisma.subject.create({ data: { gradeId: gradeA.id, name: "Native Subject" } });

    const created = await createTimetableEntry(prisma, {
      schoolId: school.id, academicYearId: year.id, classId: classA.id,
      dayOfWeek: 1, periodId: period.id, subjectId: subjectInGradeA.id,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await editTimetableEntry(prisma, {
      entryId: created.id,
      schoolId: school.id,
      fields: { subjectId: subjectInGradeB.id },
    });

    expect(result).toMatchObject({ ok: false, error: "INVALID_SUBJECT" });
  });

  it("rejects creating a second timetable entry for the same teacher in the same slot, in a different class", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 5" } });
    const classA = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, gradeId: grade.id, section: "A" });
    const classB = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, gradeId: grade.id, section: "B" });
    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Math" } });
    const period = await prisma.period.create({ data: { schoolId: school.id, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" } });
    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550004444", name: "A Teacher", role: "teacher" },
    });
    await prisma.classTeacher.create({
      data: { classId: classA.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: year.id },
    });
    await prisma.classTeacher.create({
      data: { classId: classB.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: year.id },
    });

    const firstBooking = await createTimetableEntry(prisma, {
      schoolId: school.id, academicYearId: year.id, classId: classA.id,
      dayOfWeek: 1, periodId: period.id, subjectId: subject.id, teacherUserId: teacher.id,
    });
    expect(firstBooking.ok).toBe(true);

    const clashingBooking = await createTimetableEntry(prisma, {
      schoolId: school.id, academicYearId: year.id, classId: classB.id,
      dayOfWeek: 1, periodId: period.id, subjectId: subject.id, teacherUserId: teacher.id,
    });
    expect(clashingBooking).toMatchObject({ ok: false, error: "TEACHER_ALREADY_BOOKED" });
  });

  it("rejects a period belonging to another school", async () => {
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const foreignPeriod = await prisma.period.create({
      data: {
        schoolId: otherSchool.id,
        order: 1,
        label: "Foreign Period 1",
        startTime: "09:00",
        endTime: "09:45",
      },
    });

    const result = await createTimetableEntry(prisma, {
      schoolId,
      academicYearId: yearId,
      classId,
      dayOfWeek: 1,
      periodId: foreignPeriod.id,
      subjectId,
    });

    expect(result).toEqual({ ok: false, error: "INVALID_PERIOD" });

    const written = await prisma.timetableEntry.count({ where: { periodId: foreignPeriod.id } });
    expect(written).toBe(0);
  });

  it("rejects scheduling a lesson into a break period", async () => {
    const breakPeriod = await prisma.period.create({
      data: {
        schoolId,
        order: 99,
        label: "Lunch",
        isBreak: true,
        startTime: "12:00",
        endTime: "12:45",
      },
    });

    const result = await createTimetableEntry(prisma, {
      schoolId,
      academicYearId: yearId,
      classId,
      dayOfWeek: 1,
      periodId: breakPeriod.id,
      subjectId,
    });

    expect(result).toEqual({ ok: false, error: "BREAK_PERIOD" });
  });

  it("still accepts a teaching period belonging to this school", async () => {
    const result = await createTimetableEntry(prisma, {
      schoolId,
      academicYearId: yearId,
      classId,
      dayOfWeek: 1,
      periodId,
      subjectId,
    });

    expect(result.ok).toBe(true);
  });
});
