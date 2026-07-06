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

export { displayStatus, isOverdue };
