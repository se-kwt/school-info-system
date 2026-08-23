import type { PrismaClient } from "@prisma/client";

export async function createSeedFixtures(prisma: PrismaClient) {
  const school = await prisma.school.create({ data: { name: "Greenwood High" } });

  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: "2026-27",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-04-30"),
      status: "active",
    },
  });

  const grade = await prisma.grade.create({
    data: { schoolId: school.id, name: "Grade 5", sortOrder: 5 },
  });

  const subject = await prisma.subject.create({
    data: { gradeId: grade.id, name: "Mathematics" },
  });

  const classA = await prisma.class.create({
    data: { schoolId: school.id, gradeId: grade.id, section: "A", academicYearId: academicYear.id },
  });

  const teacher = await prisma.user.create({
    data: { phone: "+10000000001", role: "teacher", name: "Anitha Rao", schoolId: school.id },
  });

  const admin = await prisma.user.create({
    data: { phone: "+10000000002", role: "admin", name: "Rajesh Kumar", schoolId: school.id },
  });

  const accountant = await prisma.user.create({
    data: { phone: "+10000000003", role: "accountant", name: "Meena Iyer", schoolId: school.id },
  });

  const parent = await prisma.user.create({
    data: { phone: "+10000000004", role: "parent", name: "Priya Sharma", schoolId: school.id },
  });

  const student = await prisma.student.create({
    data: {
      schoolId: school.id,
      name: "Rohan Sharma",
      dob: new Date("2015-04-12"),
      admissionNo: "GH-2026-001",
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      classId: classA.id,
      academicYearId: academicYear.id,
      status: "active",
      rollNumber: "GH-2026-001",
    },
  });

  await prisma.parentStudent.create({
    data: { parentUserId: parent.id, studentId: student.id },
  });

  await prisma.classTeacher.create({
    data: {
      classId: classA.id,
      teacherUserId: teacher.id,
      subjectId: subject.id,
      academicYearId: academicYear.id,
    },
  });

  return { school, academicYear, grade, classA, teacher, admin, accountant, parent, student };
}
