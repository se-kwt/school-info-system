import type { PrismaClient } from "@prisma/client";

export async function createActiveYear(prisma: PrismaClient, schoolId: number, name = "2026-27") {
  return prisma.academicYear.create({
    data: {
      schoolId,
      name,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-04-30"),
      status: "active",
    },
  });
}

export async function createEnrolledStudent(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    classId: number;
    academicYearId: number;
    name: string;
    dob: Date;
    admissionNo: string;
    rollNumber?: string;
    photoUrl?: string | null;
  }
) {
  const student = await prisma.student.create({
    data: {
      schoolId: params.schoolId,
      name: params.name,
      dob: params.dob,
      admissionNo: params.admissionNo,
      rollNumber: params.rollNumber ?? params.admissionNo,
      photoUrl: params.photoUrl ?? null,
    },
  });
  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      classId: params.classId,
      academicYearId: params.academicYearId,
      status: "active",
    },
  });
  return student;
}
