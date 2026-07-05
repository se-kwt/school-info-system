import type { PrismaClient, Student, Class } from "@prisma/client";

export async function getStudentsForParent(
  prisma: PrismaClient,
  parentUserId: number
): Promise<Student[]> {
  const links = await prisma.parentStudent.findMany({
    where: { parentUserId },
    include: { student: true },
  });
  return links.map((link) => link.student);
}

export async function getClassesForTeacher(
  prisma: PrismaClient,
  teacherUserId: number
): Promise<Class[]> {
  const links = await prisma.classTeacher.findMany({
    where: { teacherUserId },
    include: { class: true },
    distinct: ["classId"],
  });
  return links.map((link) => link.class);
}
