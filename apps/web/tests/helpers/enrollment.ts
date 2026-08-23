import type { PrismaClient } from "@prisma/client";

export async function createClass(
  prisma: PrismaClient,
  params: { schoolId: number; academicYearId: number; name?: string; section?: string; gradeId?: number }
) {
  // This read-then-create max+1 has the same theoretical race as the
  // pre-fix `createGrade` in src/lib/school-setup/grades.ts (which now
  // wraps it in a Serializable transaction — see the comment there). It's
  // intentionally not duplicated here: every test in this suite calls
  // `resetDb()` in `beforeEach` and awaits helpers sequentially rather than
  // firing concurrent grade-creating calls, so there's no genuine race to
  // guard against in this file.
  let gradeId = params.gradeId;
  if (gradeId === undefined) {
    const highest = await prisma.grade.findFirst({
      where: { schoolId: params.schoolId },
      orderBy: { sortOrder: "desc" },
    });
    const sortOrder = (highest?.sortOrder ?? 0) + 1;
    const grade = await prisma.grade.create({
      data: { schoolId: params.schoolId, name: params.name ?? `Grade ${Math.floor(Math.random() * 100000)}`, sortOrder },
    });
    gradeId = grade.id;
  }
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
