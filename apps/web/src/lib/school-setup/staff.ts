import type { PrismaClient, Role } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

type StaffRole = Exclude<Role, "parent">;

export interface StaffSummary {
  id: number;
  name: string;
  phone: string;
  role: StaffRole;
  status: "active" | "inactive";
  classAssignment: { gradeName: string; section: string; subjectName: string } | null;
}

export async function listStaff(prisma: PrismaClient, schoolId: number): Promise<StaffSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });
  const users = await prisma.user.findMany({
    where: { schoolId, role: { in: ["teacher", "admin", "accountant"] } },
    include: {
      classesTaught: {
        where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
        include: { class: { include: { grade: true } }, subject: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return users.map((user) => {
    const assignment = user.classesTaught[0];
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role as StaffRole,
      status: user.status,
      classAssignment: assignment
        ? { gradeName: assignment.class.grade.name, section: assignment.class.section, subjectName: assignment.subject.name }
        : null,
    };
  });
}

export type CreateStaffResult =
  | { ok: true; staff: { id: number; name: string; phone: string; role: Role } }
  | { ok: false; error: "DUPLICATE_PHONE" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SUBJECT" };

export async function createStaff(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: { name: string; phone: string; role: Role; classId?: number; subjectId?: number }
): Promise<CreateStaffResult> {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) return { ok: false, error: "DUPLICATE_PHONE" };

  let targetClass = null;
  if (input.role === "teacher" && input.classId) {
    targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
    if (!targetClass) return { ok: false, error: "INVALID_CLASS" };
    if (input.subjectId) {
      const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, gradeId: targetClass.gradeId } });
      if (!subject) return { ok: false, error: "INVALID_SUBJECT" };
    }
  }

  try {
    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { schoolId, name: input.name, phone: input.phone, role: input.role },
      });

      if (input.role === "teacher" && input.classId && input.subjectId) {
        await tx.classTeacher.create({
          data: {
            classId: input.classId,
            teacherUserId: created.id,
            subjectId: input.subjectId,
            academicYearId,
          },
        });
      }

      return created;
    });

    return { ok: true, staff: { id: staff.id, name: staff.name, phone: staff.phone, role: staff.role } };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE_PHONE" };
    throw err;
  }
}

export type EditStaffResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_PHONE" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "ROLE_CLASS_MISMATCH" }
  | { ok: false; error: "SUBJECT_REQUIRED" }
  | { ok: false; error: "NO_ACTIVE_YEAR" };

export async function editStaff(
  prisma: PrismaClient,
  params: {
    userId: number;
    schoolId: number;
    academicYearId: number | null;
    fields: {
      name?: string;
      phone?: string;
      role?: Role;
      classId?: number | null;
      subjectId?: number | null;
    };
  }
): Promise<EditStaffResult> {
  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.phone && params.fields.phone !== user.phone) {
    const existing = await prisma.user.findUnique({ where: { phone: params.fields.phone } });
    if (existing) return { ok: false, error: "DUPLICATE_PHONE" };
  }

  const nextRole = params.fields.role ?? user.role;
  const assigningClass = params.fields.classId !== undefined && params.fields.classId !== null;

  if (assigningClass && nextRole !== "teacher") return { ok: false, error: "ROLE_CLASS_MISMATCH" };
  if (assigningClass && !params.fields.subjectId) return { ok: false, error: "SUBJECT_REQUIRED" };
  let targetClass = null;
  if (assigningClass) {
    targetClass = await prisma.class.findFirst({ where: { id: params.fields.classId as number, schoolId: params.schoolId } });
    if (!targetClass) return { ok: false, error: "INVALID_CLASS" };
    if (!params.academicYearId) return { ok: false, error: "NO_ACTIVE_YEAR" };
    const subject = await prisma.subject.findFirst({ where: { id: params.fields.subjectId as number, gradeId: targetClass.gradeId } });
    if (!subject) return { ok: false, error: "INVALID_SUBJECT" };
  }

  await prisma.$transaction(async (tx) => {
    const data: { name?: string; phone?: string; role?: Role } = {};
    if (params.fields.name !== undefined) data.name = params.fields.name;
    if (params.fields.phone !== undefined) data.phone = params.fields.phone;
    if (params.fields.role !== undefined) data.role = params.fields.role;
    if (Object.keys(data).length > 0) {
      await tx.user.update({ where: { id: params.userId }, data });
    }

    const shouldClearAssignment = nextRole !== "teacher" || params.fields.classId === null;
    if ((shouldClearAssignment || assigningClass) && params.academicYearId) {
      await tx.classTeacher.deleteMany({
        where: { teacherUserId: params.userId, academicYearId: params.academicYearId },
      });
    }

    if (assigningClass && params.academicYearId) {
      await tx.classTeacher.create({
        data: {
          classId: params.fields.classId as number,
          teacherUserId: params.userId,
          subjectId: params.fields.subjectId as number,
          academicYearId: params.academicYearId,
        },
      });
    }
  });

  return { ok: true };
}

export type DeleteStaffResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "SELF" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteStaff(
  prisma: PrismaClient,
  params: { userId: number; schoolId: number; requestingUserId: number }
): Promise<DeleteStaffResult> {
  if (params.userId === params.requestingUserId) return { ok: false, error: "SELF" };

  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  const [attendanceCount, assignmentCount, feePaymentCount, timetableCount, promotionRunCount] = await Promise.all([
    prisma.attendance.count({ where: { markedById: params.userId } }),
    prisma.assignment.count({ where: { createdById: params.userId } }),
    prisma.feePayment.count({ where: { recordedById: params.userId } }),
    prisma.timetableEntry.count({ where: { teacherUserId: params.userId } }),
    prisma.promotionRun.count({ where: { initiatedById: params.userId } }),
  ]);

  const hasHistory = attendanceCount + assignmentCount + feePaymentCount + timetableCount + promotionRunCount > 0;
  if (hasHistory) return { ok: false, error: "HAS_HISTORY" };

  await prisma.$transaction(async (tx) => {
    await tx.classTeacher.deleteMany({ where: { teacherUserId: params.userId } });
    await tx.user.delete({ where: { id: params.userId } });
  });

  return { ok: true, deleted: true };
}

export type DeactivateStaffResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "SELF" };

export async function deactivateStaff(
  prisma: PrismaClient,
  params: { userId: number; schoolId: number; requestingUserId: number; academicYearId: number | null }
): Promise<DeactivateStaffResult> {
  if (params.userId === params.requestingUserId) return { ok: false, error: "SELF" };

  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: params.userId }, data: { status: "inactive" } });
    if (params.academicYearId) {
      await tx.classTeacher.deleteMany({
        where: { teacherUserId: params.userId, academicYearId: params.academicYearId },
      });
    }
  });

  return { ok: true };
}

export type ActivateStaffResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function activateStaff(
  prisma: PrismaClient,
  params: { userId: number; schoolId: number }
): Promise<ActivateStaffResult> {
  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  await prisma.user.update({ where: { id: params.userId }, data: { status: "active" } });
  return { ok: true };
}
