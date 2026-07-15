import type { PrismaClient, Student } from "@prisma/client";

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
  teacherUserId: number,
  academicYearId: number
): Promise<Array<{ id: number; gradeId: number; gradeName: string; section: string }>> {
  const links = await prisma.classTeacher.findMany({
    where: { teacherUserId, academicYearId },
    include: { class: { include: { grade: true } } },
    distinct: ["classId"],
  });
  return links.map((link) => ({
    id: link.class.id,
    gradeId: link.class.gradeId,
    gradeName: link.class.grade.name,
    section: link.class.section,
  }));
}
