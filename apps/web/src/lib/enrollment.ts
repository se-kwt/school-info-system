import type { PrismaClient } from "@prisma/client";

export interface EnrolledStudent {
  id: number;
  name: string;
  rollNumber: string | null;
  photoUrl: string | null;
}

export async function getEnrolledStudents(
  prisma: PrismaClient,
  params: { classId: number; academicYearId: number }
): Promise<EnrolledStudent[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId, status: "active" },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });
  return enrollments.map((enrollment) => ({
    id: enrollment.student.id,
    name: enrollment.student.name,
    rollNumber: enrollment.rollNumber,
    photoUrl: enrollment.student.photoUrl,
  }));
}
