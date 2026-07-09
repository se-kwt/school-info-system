import type { PrismaClient, StudentStatus } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  status: StudentStatus;
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}

export async function listStudents(prisma: PrismaClient, schoolId: number): Promise<StudentSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      parentLinks: { include: { parent: true } },
      enrollments: {
        where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
        include: { class: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return students.map((student) => {
    const enrollment = student.enrollments[0];
    return {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      status: student.status,
      class: enrollment ? { name: enrollment.class.name, section: enrollment.class.section } : null,
      parents: student.parentLinks.map((link) => ({ name: link.parent.name, phone: link.parent.phone })),
    };
  });
}

export type CreateStudentResult =
  | { ok: true; student: { id: number; name: string; admissionNo: string } }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PARENT_NAME_REQUIRED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function createStudent(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    parentPhone: string;
    parentName?: string;
  }
): Promise<CreateStudentResult> {
  const existingAdmission = await prisma.student.findUnique({ where: { admissionNo: input.admissionNo } });
  if (existingAdmission) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };

  const existingParent = await prisma.user.findUnique({ where: { phone: input.parentPhone } });
  if (existingParent && existingParent.role !== "parent") return { ok: false, error: "PHONE_WRONG_ROLE" };
  if (!existingParent && !input.parentName) return { ok: false, error: "PARENT_NAME_REQUIRED" };

  const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
  if (!targetClass) return { ok: false, error: "INVALID_CLASS" };

  try {
    const student = await prisma.$transaction(async (tx) => {
      const parent =
        existingParent ??
        (await tx.user.create({
          data: { schoolId, phone: input.parentPhone, name: input.parentName as string, role: "parent" },
        }));

      const createdStudent = await tx.student.create({
        data: { schoolId, name: input.name, dob: new Date(input.dob), admissionNo: input.admissionNo },
      });

      await tx.enrollment.create({
        data: { studentId: createdStudent.id, classId: input.classId, academicYearId, status: "active" },
      });

      await tx.parentStudent.create({
        data: { parentUserId: parent.id, studentId: createdStudent.id },
      });

      return createdStudent;
    });

    return {
      ok: true,
      student: { id: student.id, name: student.name, admissionNo: student.admissionNo },
    };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    throw err;
  }
}

export type EditStudentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "NO_ACTIVE_ENROLLMENT" };

export async function editStudent(
  prisma: PrismaClient,
  params: {
    studentId: number;
    schoolId: number;
    academicYearId: number | null;
    fields: { name?: string; dob?: string; admissionNo?: string; classId?: number };
  }
): Promise<EditStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.admissionNo && params.fields.admissionNo !== student.admissionNo) {
    const existing = await prisma.student.findUnique({ where: { admissionNo: params.fields.admissionNo } });
    if (existing) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
  }

  if (params.fields.classId !== undefined) {
    if (!params.academicYearId) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId } },
    });
    if (!enrollment) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    const targetClass = await prisma.class.findFirst({
      where: { id: params.fields.classId, schoolId: params.schoolId },
    });
    if (!targetClass) return { ok: false, error: "INVALID_CLASS" };
  }

  await prisma.$transaction(async (tx) => {
    const data: { name?: string; dob?: Date; admissionNo?: string } = {};
    if (params.fields.name !== undefined) data.name = params.fields.name;
    if (params.fields.dob !== undefined) data.dob = new Date(params.fields.dob);
    if (params.fields.admissionNo !== undefined) data.admissionNo = params.fields.admissionNo;
    if (Object.keys(data).length > 0) {
      await tx.student.update({ where: { id: params.studentId }, data });
    }

    if (params.fields.classId !== undefined && params.academicYearId) {
      await tx.enrollment.update({
        where: {
          studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId },
        },
        data: { classId: params.fields.classId },
      });
    }
  });

  return { ok: true };
}

export type DeleteStudentResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteStudent(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number }
): Promise<DeleteStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  const [attendanceCount, markCount, feePaymentCount, assignmentStatusCount, promotionLogCount, enrollmentCount] =
    await Promise.all([
      prisma.attendance.count({ where: { studentId: params.studentId } }),
      prisma.mark.count({ where: { studentId: params.studentId } }),
      prisma.feePayment.count({ where: { studentId: params.studentId } }),
      prisma.assignmentStatus.count({ where: { studentId: params.studentId } }),
      prisma.promotionLogEntry.count({ where: { studentId: params.studentId } }),
      prisma.enrollment.count({ where: { studentId: params.studentId } }),
    ]);

  const hasHistory =
    attendanceCount + markCount + feePaymentCount + assignmentStatusCount + promotionLogCount > 0 ||
    enrollmentCount > 1;
  if (hasHistory) return { ok: false, error: "HAS_HISTORY" };

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.deleteMany({ where: { studentId: params.studentId } });
    await tx.parentStudent.deleteMany({ where: { studentId: params.studentId } });
    await tx.student.delete({ where: { id: params.studentId } });
  });

  return { ok: true, deleted: true };
}

export type DeactivateStudentResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function deactivateStudent(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number; academicYearId: number | null }
): Promise<DeactivateStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: params.studentId }, data: { status: "inactive" } });
    if (params.academicYearId) {
      await tx.enrollment.updateMany({
        where: { studentId: params.studentId, academicYearId: params.academicYearId },
        data: { status: "inactive" },
      });
    }
  });

  return { ok: true };
}

export type ActivateStudentResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function activateStudent(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number; academicYearId: number | null }
): Promise<ActivateStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: params.studentId }, data: { status: "active" } });
    if (params.academicYearId) {
      await tx.enrollment.updateMany({
        where: { studentId: params.studentId, academicYearId: params.academicYearId, status: "inactive" },
        data: { status: "active" },
      });
    }
  });

  return { ok: true };
}
