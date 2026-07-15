import type { PrismaClient } from "@prisma/client";

export async function createClass(
  prisma: PrismaClient,
  params: { schoolId: number; academicYearId: number; name?: string; section?: string; gradeId?: number }
) {
  const gradeId =
    params.gradeId ??
    (
      await prisma.grade.create({
        data: { schoolId: params.schoolId, name: params.name ?? `Grade ${Math.floor(Math.random() * 100000)}` },
      })
    ).id;
  return prisma.class.create({
    data: {
      schoolId: params.schoolId,
      gradeId,
      section: params.section ?? "A",
      academicYearId: params.academicYearId,
    },
    include: { grade: true },
  });
}

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
  }
) {
  const student = await prisma.student.create({
    data: {
      schoolId: params.schoolId,
      name: params.name,
      dob: params.dob,
      admissionNo: params.admissionNo,
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
