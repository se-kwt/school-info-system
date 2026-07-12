import type { PrismaClient, StudentStatus } from "@prisma/client";
import { isUniqueConstraintViolation, uniqueConstraintTarget } from "./prisma-errors";

export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: StudentStatus;
  gender: "male" | "female" | null;
  studentIdNumber: string | null;
  dateOfJoin: string | null;
  class: { name: string; section: string } | null;
  parents: { relationship: string; name: string; phone: string; email: string | null }[];
  siblings: { id: number; name: string; admissionNo: string; gender: "male" | "female" | null; class: { name: string; section: string } | null }[];
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

  const studentIds = students.map((s) => s.id);
  const byId = new Map(students.map((s) => [s.id, s]));
  const siblingLinks = await prisma.studentSibling.findMany({
    where: { OR: [{ studentId: { in: studentIds } }, { siblingId: { in: studentIds } }] },
  });

  function siblingSummary(id: number) {
    const s = byId.get(id);
    if (!s) return null;
    const enrollment = s.enrollments[0];
    return {
      id: s.id,
      name: s.name,
      admissionNo: s.admissionNo,
      gender: s.gender,
      class: enrollment ? { name: enrollment.class.name, section: enrollment.class.section } : null,
    };
  }

  const siblingsByStudent = new Map<number, ReturnType<typeof siblingSummary>[]>();
  function addSibling(ownerId: number, otherId: number) {
    if (!byId.has(ownerId)) return;
    const summary = siblingSummary(otherId);
    if (!summary) return;
    const list = siblingsByStudent.get(ownerId) ?? [];
    list.push(summary);
    siblingsByStudent.set(ownerId, list);
  }
  for (const link of siblingLinks) {
    addSibling(link.studentId, link.siblingId);
    addSibling(link.siblingId, link.studentId);
  }

  return students.map((student) => {
    const enrollment = student.enrollments[0];
    return {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      rollNumber: enrollment?.rollNumber ?? null,
      photoUrl: student.photoUrl,
      status: student.status,
      gender: student.gender,
      studentIdNumber: student.studentIdNumber,
      dateOfJoin: student.dateOfJoin ? student.dateOfJoin.toISOString().slice(0, 10) : null,
      class: enrollment ? { name: enrollment.class.name, section: enrollment.class.section } : null,
      parents: student.parentLinks.map((link) => ({
        relationship: link.relationship,
        name: link.parent.name,
        phone: link.parent.phone,
        email: link.parent.email,
      })),
      siblings: (siblingsByStudent.get(student.id) ?? []).filter((s): s is NonNullable<typeof s> => s !== null),
    };
  });
}

export type CreateStudentResult =
  | { ok: true; student: { id: number; name: string; admissionNo: string } }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "DUPLICATE_STUDENT_ID" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PARENT_REQUIRED" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SIBLING" };

export async function createStudent(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    rollNumber?: string;
    photoUrl?: string;
    gender?: "male" | "female";
    studentIdNumber?: string;
    dateOfJoin?: string;
    parents: { relationship: string; name: string; phone: string; email?: string }[];
    siblingStudentIds?: number[];
  }
): Promise<CreateStudentResult> {
  const existingAdmission = await prisma.student.findUnique({ where: { admissionNo: input.admissionNo } });
  if (existingAdmission) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };

  if (input.studentIdNumber) {
    const existingStudentId = await prisma.student.findUnique({ where: { studentIdNumber: input.studentIdNumber } });
    if (existingStudentId) return { ok: false, error: "DUPLICATE_STUDENT_ID" };
  }

  if (input.rollNumber) {
    const existingRollNumber = await prisma.enrollment.findFirst({
      where: { classId: input.classId, academicYearId, rollNumber: input.rollNumber },
    });
    if (existingRollNumber) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
  }

  if (input.parents.length === 0) return { ok: false, error: "PARENT_REQUIRED" };

  for (const parentInput of input.parents) {
    const existingParent = await prisma.user.findUnique({ where: { phone: parentInput.phone } });
    if (existingParent && existingParent.role !== "parent") return { ok: false, error: "PHONE_WRONG_ROLE" };
  }

  if (input.siblingStudentIds && input.siblingStudentIds.length > 0) {
    const siblingCount = await prisma.student.count({
      where: { id: { in: input.siblingStudentIds }, schoolId },
    });
    if (siblingCount !== input.siblingStudentIds.length) return { ok: false, error: "INVALID_SIBLING" };
  }

  const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
  if (!targetClass) return { ok: false, error: "INVALID_CLASS" };

  try {
    const student = await prisma.$transaction(async (tx) => {
      const createdStudent = await tx.student.create({
        data: {
          schoolId,
          name: input.name,
          dob: new Date(input.dob),
          admissionNo: input.admissionNo,
          photoUrl: input.photoUrl ?? null,
          gender: input.gender ?? null,
          studentIdNumber: input.studentIdNumber ?? null,
          dateOfJoin: input.dateOfJoin ? new Date(input.dateOfJoin) : null,
        },
      });

      await tx.enrollment.create({
        data: {
          studentId: createdStudent.id,
          classId: input.classId,
          academicYearId,
          status: "active",
          rollNumber: input.rollNumber ?? null,
        },
      });

      for (const parentInput of input.parents) {
        const existingParent = await tx.user.findUnique({ where: { phone: parentInput.phone } });
        const parent =
          existingParent ??
          (await tx.user.create({
            data: {
              schoolId,
              phone: parentInput.phone,
              name: parentInput.name,
              email: parentInput.email ?? null,
              role: "parent",
            },
          }));

        await tx.parentStudent.create({
          data: { parentUserId: parent.id, studentId: createdStudent.id, relationship: parentInput.relationship },
        });
      }

      if (input.siblingStudentIds) {
        for (const siblingId of input.siblingStudentIds) {
          await tx.studentSibling.create({ data: { studentId: createdStudent.id, siblingId } });
        }
      }

      return createdStudent;
    });

    return {
      ok: true,
      student: { id: student.id, name: student.name, admissionNo: student.admissionNo },
    };
  } catch (err) {
    const target = uniqueConstraintTarget(err);
    if (target?.includes("rollNumber")) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    if (target?.includes("studentIdNumber")) return { ok: false, error: "DUPLICATE_STUDENT_ID" };
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    throw err;
  }
}

export type EditStudentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "DUPLICATE_STUDENT_ID" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SIBLING" }
  | { ok: false; error: "NO_ACTIVE_ENROLLMENT" };

export async function editStudent(
  prisma: PrismaClient,
  params: {
    studentId: number;
    schoolId: number;
    academicYearId: number | null;
    fields: {
      name?: string;
      dob?: string;
      admissionNo?: string;
      classId?: number;
      rollNumber?: string;
      photoUrl?: string;
      gender?: "male" | "female";
      studentIdNumber?: string;
      dateOfJoin?: string;
      parents?: { relationship: string; name: string; phone: string; email?: string }[];
      siblingStudentIds?: number[];
    };
  }
): Promise<EditStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.admissionNo && params.fields.admissionNo !== student.admissionNo) {
    const existing = await prisma.student.findUnique({ where: { admissionNo: params.fields.admissionNo } });
    if (existing) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
  }

  if (params.fields.studentIdNumber && params.fields.studentIdNumber !== student.studentIdNumber) {
    const existing = await prisma.student.findUnique({ where: { studentIdNumber: params.fields.studentIdNumber } });
    if (existing) return { ok: false, error: "DUPLICATE_STUDENT_ID" };
  }

  if (params.fields.siblingStudentIds) {
    if (params.fields.siblingStudentIds.includes(params.studentId)) return { ok: false, error: "INVALID_SIBLING" };
    const siblingCount = await prisma.student.count({
      where: { id: { in: params.fields.siblingStudentIds }, schoolId: params.schoolId },
    });
    if (siblingCount !== params.fields.siblingStudentIds.length) return { ok: false, error: "INVALID_SIBLING" };
  }

  let enrollment: { classId: number } | null = null;
  if (params.fields.classId !== undefined || params.fields.rollNumber !== undefined) {
    if (!params.academicYearId) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId } },
    });
    if (!enrollment) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    if (params.fields.classId !== undefined) {
      const targetClass = await prisma.class.findFirst({
        where: { id: params.fields.classId, schoolId: params.schoolId },
      });
      if (!targetClass) return { ok: false, error: "INVALID_CLASS" };
    }

    if (params.fields.rollNumber) {
      const targetClassId = params.fields.classId ?? enrollment.classId;
      const conflict = await prisma.enrollment.findFirst({
        where: {
          classId: targetClassId,
          academicYearId: params.academicYearId,
          rollNumber: params.fields.rollNumber,
          studentId: { not: params.studentId },
        },
      });
      if (conflict) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const data: {
        name?: string;
        dob?: Date;
        admissionNo?: string;
        photoUrl?: string;
        gender?: "male" | "female";
        studentIdNumber?: string;
        dateOfJoin?: Date;
      } = {};
      if (params.fields.name !== undefined) data.name = params.fields.name;
      if (params.fields.dob !== undefined) data.dob = new Date(params.fields.dob);
      if (params.fields.admissionNo !== undefined) data.admissionNo = params.fields.admissionNo;
      if (params.fields.photoUrl !== undefined) data.photoUrl = params.fields.photoUrl;
      if (params.fields.gender !== undefined) data.gender = params.fields.gender;
      if (params.fields.studentIdNumber !== undefined) data.studentIdNumber = params.fields.studentIdNumber;
      if (params.fields.dateOfJoin !== undefined) data.dateOfJoin = new Date(params.fields.dateOfJoin);
      if (Object.keys(data).length > 0) {
        await tx.student.update({ where: { id: params.studentId }, data });
      }

      if ((params.fields.classId !== undefined || params.fields.rollNumber !== undefined) && params.academicYearId) {
        const enrollmentData: { classId?: number; rollNumber?: string } = {};
        if (params.fields.classId !== undefined) enrollmentData.classId = params.fields.classId;
        if (params.fields.rollNumber !== undefined) enrollmentData.rollNumber = params.fields.rollNumber;
        await tx.enrollment.update({
          where: {
            studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId },
          },
          data: enrollmentData,
        });
      }

      if (params.fields.parents !== undefined) {
        const existingLinks = await tx.parentStudent.findMany({
          where: { studentId: params.studentId },
          include: { parent: true },
        });
        const newPhones = new Set(params.fields.parents.map((p) => p.phone));

        for (const link of existingLinks) {
          if (!newPhones.has(link.parent.phone)) {
            await tx.parentStudent.delete({ where: { id: link.id } });
          }
        }

        for (const parentInput of params.fields.parents) {
          let parent = await tx.user.findUnique({ where: { phone: parentInput.phone } });
          if (!parent) {
            parent = await tx.user.create({
              data: {
                schoolId: params.schoolId,
                phone: parentInput.phone,
                name: parentInput.name,
                email: parentInput.email ?? null,
                role: "parent",
              },
            });
          } else {
            await tx.user.update({
              where: { id: parent.id },
              data: { name: parentInput.name, email: parentInput.email ?? null },
            });
          }

          await tx.parentStudent.upsert({
            where: { parentUserId_studentId: { parentUserId: parent.id, studentId: params.studentId } },
            update: { relationship: parentInput.relationship },
            create: { parentUserId: parent.id, studentId: params.studentId, relationship: parentInput.relationship },
          });
        }
      }

      if (params.fields.siblingStudentIds !== undefined) {
        await tx.studentSibling.deleteMany({
          where: { OR: [{ studentId: params.studentId }, { siblingId: params.studentId }] },
        });
        for (const siblingId of params.fields.siblingStudentIds) {
          await tx.studentSibling.create({ data: { studentId: params.studentId, siblingId } });
        }
      }
    });
  } catch (err) {
    const target = uniqueConstraintTarget(err);
    if (target?.includes("rollNumber")) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    if (target?.includes("studentIdNumber")) return { ok: false, error: "DUPLICATE_STUDENT_ID" };
    throw err;
  }

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
