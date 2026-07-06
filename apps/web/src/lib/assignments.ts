import type { PrismaClient, AssignmentStatusValue } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";

function isOverdue(dueDate: Date): boolean {
  const todayStart = new Date(new Date().toISOString().slice(0, 10));
  return dueDate < todayStart;
}

function displayStatus(
  status: AssignmentStatusValue,
  dueDate: Date
): "pending" | "submitted" | "overdue" {
  if (status === "pending" && isOverdue(dueDate)) {
    return "overdue";
  }
  return status;
}

export interface AssignmentSummary {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdById: number;
  submittedCount: number;
  totalCount: number;
  hasOverdue: boolean;
}

export type ListAssignmentsResult =
  | { ok: true; assignments: AssignmentSummary[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function listAssignments(
  prisma: PrismaClient,
  params: {
    classId: number;
    schoolId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<ListAssignmentsResult> {
  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: { classId: params.classId, teacherUserId: params.userId },
    });
    if (!link) {
      return { ok: false, error: "NOT_ASSIGNED" };
    }
  } else {
    const klass = await prisma.class.findFirst({
      where: { id: params.classId, schoolId: params.schoolId },
    });
    if (!klass) {
      return { ok: false, error: "INVALID_CLASS" };
    }
  }

  const assignments = await prisma.assignment.findMany({
    where: { classId: params.classId },
    include: { statuses: true },
    orderBy: { dueDate: "desc" },
  });

  const result: AssignmentSummary[] = assignments.map((assignment) => {
    const submittedCount = assignment.statuses.filter((s) => s.status === "submitted").length;
    const hasOverdue = assignment.statuses.some(
      (s) => s.status === "pending" && isOverdue(assignment.dueDate)
    );
    return {
      id: assignment.id,
      subject: assignment.subject,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate.toISOString().slice(0, 10),
      createdById: assignment.createdById,
      submittedCount,
      totalCount: assignment.statuses.length,
      hasOverdue,
    };
  });

  return { ok: true, assignments: result };
}

export type CreateAssignmentResult = { ok: true; id: number } | { ok: false; error: "NOT_ASSIGNED" };

export async function createAssignment(
  prisma: PrismaClient,
  params: {
    classId: number;
    teacherUserId: number;
    subject: string;
    title: string;
    description?: string;
    dueDate: string;
  }
): Promise<CreateAssignmentResult> {
  const link = await prisma.classTeacher.findFirst({
    where: { classId: params.classId, teacherUserId: params.teacherUserId },
  });
  if (!link) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: {
        classId: params.classId,
        subject: params.subject,
        title: params.title,
        description: params.description ?? null,
        dueDate: new Date(params.dueDate),
        createdById: params.teacherUserId,
      },
    });

    const students = await tx.student.findMany({
      where: { classId: params.classId },
      select: { id: true },
    });

    if (students.length > 0) {
      await tx.assignmentStatus.createMany({
        data: students.map((student) => ({
          assignmentId: created.id,
          studentId: student.id,
          status: "pending" as const,
        })),
      });
    }
    return created;
  });

  return { ok: true, id: assignment.id };
}

export type EditAssignmentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "FORBIDDEN" };

export async function editAssignment(
  prisma: PrismaClient,
  params: {
    assignmentId: number;
    teacherUserId: number;
    schoolId: number;
    fields: {
      subject?: string;
      title?: string;
      description?: string;
      dueDate?: string;
    };
  }
): Promise<EditAssignmentResult> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { class: true },
  });
  if (!assignment || assignment.class.schoolId !== params.schoolId) {
    return { ok: false, error: "NOT_FOUND" };
  }
  if (assignment.createdById !== params.teacherUserId) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const data: {
    subject?: string;
    title?: string;
    description?: string;
    dueDate?: Date;
  } = {};
  if (params.fields.subject !== undefined) data.subject = params.fields.subject;
  if (params.fields.title !== undefined) data.title = params.fields.title;
  if (params.fields.description !== undefined) data.description = params.fields.description;
  if (params.fields.dueDate !== undefined) data.dueDate = new Date(params.fields.dueDate);

  await prisma.assignment.update({ where: { id: params.assignmentId }, data });
  return { ok: true };
}

export interface StatusEntry {
  studentId: number;
  name: string;
  status: "pending" | "submitted" | "overdue";
}

export type GetStatusesResult =
  | { ok: true; statuses: StatusEntry[] }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "NOT_ASSIGNED" };

export async function getAssignmentStatuses(
  prisma: PrismaClient,
  params: {
    assignmentId: number;
    schoolId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<GetStatusesResult> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { class: true },
  });
  if (!assignment || assignment.class.schoolId !== params.schoolId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: { classId: assignment.classId, teacherUserId: params.userId },
    });
    if (!link) {
      return { ok: false, error: "NOT_ASSIGNED" };
    }
  }

  const statuses = await prisma.assignmentStatus.findMany({
    where: { assignmentId: params.assignmentId },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });

  return {
    ok: true,
    statuses: statuses.map((s) => ({
      studentId: s.studentId,
      name: s.student.name,
      status: displayStatus(s.status, assignment.dueDate),
    })),
  };
}

export type UpdateStatusesResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "STUDENT_MISMATCH" };

export async function updateAssignmentStatuses(
  prisma: PrismaClient,
  params: {
    assignmentId: number;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "pending" | "submitted" }>;
  }
): Promise<UpdateStatusesResult> {
  const assignment = await prisma.assignment.findUnique({ where: { id: params.assignmentId } });
  if (!assignment) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const link = await prisma.classTeacher.findFirst({
    where: { classId: assignment.classId, teacherUserId: params.teacherUserId },
  });
  if (!link) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const studentCount = await prisma.student.count({
    where: {
      classId: assignment.classId,
      id: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (studentCount !== params.entries.length) {
    return { ok: false, error: "STUDENT_MISMATCH" };
  }

  await prisma.$transaction(
    params.entries.map((entry) =>
      prisma.assignmentStatus.upsert({
        where: {
          assignmentId_studentId: { assignmentId: params.assignmentId, studentId: entry.studentId },
        },
        create: {
          assignmentId: params.assignmentId,
          studentId: entry.studentId,
          status: entry.status,
        },
        update: { status: entry.status },
      })
    )
  );

  return { ok: true };
}

export { displayStatus, isOverdue };
