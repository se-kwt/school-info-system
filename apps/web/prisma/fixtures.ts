import type { PrismaClient } from "@prisma/client";

export async function createSeedFixtures(prisma: PrismaClient) {
  const school = await prisma.school.create({ data: { name: "Greenwood High" } });

  const classA = await prisma.class.create({
    data: { schoolId: school.id, name: "Grade 5", section: "A" },
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
      classId: classA.id,
      section: "A",
      admissionNo: "GH-2026-001",
      rollNumber: "GH-2026-001",
    },
  });

  await prisma.parentStudent.create({
    data: { parentUserId: parent.id, studentId: student.id },
  });

  await prisma.classTeacher.create({
    data: { classId: classA.id, teacherUserId: teacher.id, subject: "Mathematics" },
  });

  return { school, classA, teacher, admin, accountant, parent, student };
}
