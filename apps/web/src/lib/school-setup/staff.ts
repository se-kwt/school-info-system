import type { PrismaClient, Role } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";
import { isValidPhone, normalizePhone } from "../phone";

type StaffRole = Exclude<Role, "parent">;

export interface StaffSummary {
  id: number;
  name: string;
  phone: string;
  role: StaffRole;
  status: "active" | "inactive";
  classAssignment: { gradeName: string; section: string; subjectName: string } | null;
}

export async function listStaff(
  prisma: PrismaClient,
  schoolId: number,
  options?: { page?: number; pageSize?: number }
): Promise<StaffSummary[]> {
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
    ...(options?.page && options?.pageSize
      ? { skip: (options.page - 1) * options.pageSize, take: options.pageSize }
      : {}),
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
  | { ok: false; error: "INVALID_PHONE" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SUBJECT" };

export async function createStaff(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    name: string;
    phone: string;
    role: Role;
    classId?: number;
    subjectId?: number;
    qualification?: string;
    designation?: string;
    joiningDate?: string;
    salary?: number;
    address?: string;
    photoUrl?: string;
  }
): Promise<CreateStaffResult> {
  if (!isValidPhone(input.phone)) return { ok: false, error: "INVALID_PHONE" };
  const phone = normalizePhone(input.phone);

  const existing = await prisma.user.findUnique({ where: { phone } });
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
        data: {
          schoolId,
          name: input.name,
          phone,
          role: input.role,
          qualification: input.qualification,
          designation: input.designation,
          joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
          salary: input.salary ?? null,
          address: input.address,
          photoUrl: input.photoUrl,
        },
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
  | { ok: false; error: "INVALID_PHONE" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "ROLE_CLASS_MISMATCH" }
  | { ok: false; error: "SUBJECT_REQUIRED" }
  | { ok: false; error: "NO_ACTIVE_YEAR" }
  | { ok: false; error: "TEACHER_INACTIVE" };

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
      qualification?: string;
      designation?: string;
      joiningDate?: string;
      salary?: number;
      address?: string;
      photoUrl?: string;
    };
  }
): Promise<EditStaffResult> {
  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  let normalizedPhone: string | undefined;
  if (params.fields.phone !== undefined) {
    if (!isValidPhone(params.fields.phone)) return { ok: false, error: "INVALID_PHONE" };
    normalizedPhone = normalizePhone(params.fields.phone);
    if (normalizedPhone !== user.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
      if (existing) return { ok: false, error: "DUPLICATE_PHONE" };
    }
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
    if (user.status !== "active") return { ok: false, error: "TEACHER_INACTIVE" };
  }

  await prisma.$transaction(async (tx) => {
    const data: {
      name?: string;
      phone?: string;
      role?: Role;
      qualification?: string;
      designation?: string;
      joiningDate?: Date | null;
      salary?: number | null;
      address?: string;
      photoUrl?: string;
    } = {};
    if (params.fields.name !== undefined) data.name = params.fields.name;
    if (normalizedPhone !== undefined) data.phone = normalizedPhone;
    if (params.fields.role !== undefined) data.role = params.fields.role;
    if (params.fields.qualification !== undefined) data.qualification = params.fields.qualification;
    if (params.fields.designation !== undefined) data.designation = params.fields.designation;
    if (params.fields.joiningDate !== undefined) data.joiningDate = params.fields.joiningDate ? new Date(params.fields.joiningDate) : null;
    if (params.fields.salary !== undefined) data.salary = params.fields.salary ?? null;
    if (params.fields.address !== undefined) data.address = params.fields.address;
    if (params.fields.photoUrl !== undefined) data.photoUrl = params.fields.photoUrl;
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

  const [attendanceCount, assignmentCount, feePaymentCount, timetableCount, classTeacherCount, promotionRunCount] =
    await Promise.all([
      prisma.attendance.count({ where: { markedById: params.userId } }),
      prisma.assignment.count({ where: { createdById: params.userId } }),
      prisma.feePayment.count({ where: { recordedById: params.userId } }),
      prisma.timetableEntry.count({ where: { teacherUserId: params.userId } }),
      // `deactivateStaff` clears a teacher's timetable slots (teacherUserId ->
      // null) but deliberately preserves their `ClassTeacher` rows, so those rows
      // — not the timetable count — are the durable record of assignment history
      // for a deactivated teacher. Count them too or a deactivate-then-delete
      // flow could hard-delete a teacher whose only footprint was timetable rows,
      // destroying the ClassTeacher history Task 5 set out to preserve.
      prisma.classTeacher.count({ where: { teacherUserId: params.userId } }),
      prisma.promotionRun.count({ where: { initiatedById: params.userId } }),
    ]);

  const hasHistory =
    attendanceCount + assignmentCount + feePaymentCount + timetableCount + classTeacherCount + promotionRunCount > 0;
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
      // Faculty assignments are KEPT. `assignTeacherToSubject` already refuses to
      // create new ones for an inactive teacher (Phase 1), and the read paths that
      // offer a teacher for further staffing action filter on status:
      // `listClassFaculty` only returns links to active teachers, and
      // `createTimetableEntry`/`editTimetableEntry` reject staffing an inactive
      // teacher onto a slot even though their `ClassTeacher` link still exists.
      // So keeping the rows costs nothing and makes reactivation lossless.
      await tx.timetableEntry.updateMany({
        where: { teacherUserId: params.userId, academicYearId: params.academicYearId },
        data: { teacherUserId: null },
      });
    }
  });

  return { ok: true };
}

export type ActivateStaffResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function activateStaff(
  prisma: PrismaClient,
  params: { userId: number; schoolId: number; academicYearId?: number | null }
): Promise<ActivateStaffResult> {
  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: params.userId }, data: { status: "active" } });

    if (params.academicYearId) {
      const links = await tx.classTeacher.findMany({
        where: { teacherUserId: params.userId, academicYearId: params.academicYearId },
      });

      // Restore is deliberately conservative: it only fills slots that are still
      // unstaffed for a class/subject this teacher is assigned to. If another
      // teacher was put into the slot while this one was away, that assignment
      // wins, and the restore can never violate the double-booking unique index
      // because it never displaces an existing occupant.
      //
      // Accepted imprecision: if two teachers assigned to the same class and
      // subject are both deactivated and both reactivated, the first to be
      // reactivated takes all the unstaffed slots. Getting this exactly right
      // would need a record of which teacher held which slot — a new table for
      // a rare case — so it's left as-is.
      for (const link of links) {
        await tx.timetableEntry.updateMany({
          where: {
            classId: link.classId,
            subjectId: link.subjectId,
            academicYearId: params.academicYearId,
            teacherUserId: null,
          },
          data: { teacherUserId: params.userId },
        });
      }
    }
  });

  return { ok: true };
}
