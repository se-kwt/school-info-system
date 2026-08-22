import type { AssignmentStatusValue, PrismaClient } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { getEnrolledStudents } from "./enrollment";
import { getSchoolLocalTodayStart } from "./date-utils";

function isOverdue(dueDate: Date): boolean {
  const todayStart = getSchoolLocalTodayStart();
  return dueDate < todayStart;
}

function displayStatus(
  status: AssignmentStatusValue,
  dueDate: Date
): "pending" | "submitted" | "overdue" {
  if (status === "pending" && isOverdue(dueDate)) return "overdue";
  return status;
}

export interface AssignmentSummary {
  id: number;
  subjectId: number;
  subjectName: string;
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
    academicYearId: number;
  }
): Promise<ListAssignmentsResult> {
  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: {
        classId: params.classId,
        teacherUserId: params.userId,
        academicYearId: params.academicYearId,
      },
    });
    if (!link) return { ok: false, error: "NOT_ASSIGNED" };
  } else {
    const klass = await prisma.class.findFirst({
      where: { id: params.classId, schoolId: params.schoolId },
    });
    if (!klass) return { ok: false, error: "INVALID_CLASS" };
  }

  const assignments = await prisma.assignment.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId },
    include: { statuses: true, subject: true },
    orderBy: { dueDate: "desc" },
  });

  return {
    ok: true,
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      subjectId: assignment.subjectId,
      subjectName: assignment.subject.name,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate.toISOString().slice(0, 10),
      createdById: assignment.createdById,
      submittedCount: assignment.statuses.filter((s) => s.status === "submitted").length,
      totalCount: assignment.statuses.length,
      hasOverdue: assignment.statuses.some(
        (s) => s.status === "pending" && isOverdue(assignment.dueDate)
      ),
    })),
  };
}

async function assertTeacherOwnsSubject(
  prisma: PrismaClient,
  params: { classId: number; subjectId: number; teacherUserId: number; academicYearId: number }
): Promise<boolean> {
  const link = await prisma.classTeacher.findFirst({
    where: {
      classId: params.classId,
      subjectId: params.subjectId,
      teacherUserId: params.teacherUserId,
      academicYearId: params.academicYearId,
    },
  });
  return link !== null;
}

export type CreateAssignmentResult = { ok: true; id: number } | { ok: false; error: "NOT_ASSIGNED" };

export async function createAssignment(
  prisma: PrismaClient,
  params: {
    classId: number;
    teacherUserId: number;
    subjectId: number;
    title: string;
    description?: string;
    dueDate: string;
    academicYearId: number;
    attachmentUrl?: string;
    attachmentName?: string;
  }
): Promise<CreateAssignmentResult> {
  const owns = await assertTeacherOwnsSubject(prisma, {
    classId: params.classId,
    subjectId: params.subjectId,
    teacherUserId: params.teacherUserId,
    academicYearId: params.academicYearId,
  });
  if (!owns) return { ok: false, error: "NOT_ASSIGNED" };

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: {
        classId: params.classId,
        subjectId: params.subjectId,
        title: params.title,
        description: params.description ?? null,
        dueDate: new Date(params.dueDate),
        attachmentUrl: params.attachmentUrl ?? null,
        attachmentName: params.attachmentName ?? null,
        createdById: params.teacherUserId,
        academicYearId: params.academicYearId,
      },
      include: { subject: true },
    });

    const enrolled = await getEnrolledStudents(tx as PrismaClient, {
      classId: params.classId,
      academicYearId: params.academicYearId,
    });
    if (enrolled.length > 0) {
      await tx.assignmentStatus.createMany({
        data: enrolled.map((student) => ({
          assignmentId: created.id,
          studentId: student.id,
          status: "pending" as const,
        })),
      });

      const parentLinks = await tx.parentStudent.findMany({
        where: { studentId: { in: enrolled.map((student) => student.id) } },
      });
      const distinctParentIds = [...new Set(parentLinks.map((link) => link.parentUserId))];
      if (distinctParentIds.length > 0) {
        await tx.notification.createMany({
          data: distinctParentIds.map((parentUserId) => ({
            userId: parentUserId,
            type: "assignment_published",
            title: created.title,
            body: `${created.subject.name} · Due ${params.dueDate}`,
            relatedId: created.id,
          })),
        });
      }
    }
    return created;
  });

  return { ok: true, id: assignment.id };
}

export type EditAssignmentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "FORBIDDEN" }
  | { ok: false; error: "INVALID_SUBJECT" };

export async function editAssignment(
  prisma: PrismaClient,
  params: {
    assignmentId: number;
    teacherUserId: number;
    schoolId: number;
    fields: {
      subjectId?: number;
      title?: string;
      description?: string;
      dueDate?: string;
      attachmentUrl?: string;
      attachmentName?: string;
    };
  }
): Promise<EditAssignmentResult> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { class: true },
  });
  if (!assignment || assignment.class.schoolId !== params.schoolId) return { ok: false, error: "NOT_FOUND" };
  if (assignment.createdById !== params.teacherUserId) return { ok: false, error: "FORBIDDEN" };

  if (params.fields.subjectId !== undefined) {
    const owns = await assertTeacherOwnsSubject(prisma, {
      classId: assignment.classId,
      subjectId: params.fields.subjectId,
      teacherUserId: params.teacherUserId,
      academicYearId: assignment.academicYearId,
    });
    if (!owns) return { ok: false, error: "INVALID_SUBJECT" };
  }

  const data: {
    subjectId?: number;
    title?: string;
    description?: string;
    dueDate?: Date;
    attachmentUrl?: string;
    attachmentName?: string;
  } = {};
  if (params.fields.subjectId !== undefined) data.subjectId = params.fields.subjectId;
  if (params.fields.title !== undefined) data.title = params.fields.title;
  if (params.fields.description !== undefined) data.description = params.fields.description;
  if (params.fields.dueDate !== undefined) data.dueDate = new Date(params.fields.dueDate);
  if (params.fields.attachmentUrl !== undefined) data.attachmentUrl = params.fields.attachmentUrl;
  if (params.fields.attachmentName !== undefined) data.attachmentName = params.fields.attachmentName;

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
  if (!assignment || assignment.class.schoolId !== params.schoolId) return { ok: false, error: "NOT_FOUND" };

  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: {
        classId: assignment.classId,
        teacherUserId: params.userId,
        academicYearId: assignment.academicYearId,
      },
    });
    if (!link) return { ok: false, error: "NOT_ASSIGNED" };
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
    schoolId: number;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "pending" | "submitted" }>;
  }
): Promise<UpdateStatusesResult> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { class: true },
  });
  if (!assignment || assignment.class.schoolId !== params.schoolId) return { ok: false, error: "NOT_FOUND" };

  const link = await prisma.classTeacher.findFirst({
    where: {
      classId: assignment.classId,
      teacherUserId: params.teacherUserId,
      academicYearId: assignment.academicYearId,
    },
  });
  if (!link) return { ok: false, error: "NOT_ASSIGNED" };

  const enrolledCount = await prisma.enrollment.count({
    where: {
      classId: assignment.classId,
      academicYearId: assignment.academicYearId,
      status: "active",
      studentId: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (enrolledCount !== params.entries.length) return { ok: false, error: "STUDENT_MISMATCH" };

  await prisma.$transaction(
    params.entries.map((entry) =>
      prisma.assignmentStatus.upsert({
        where: {
          assignmentId_studentId: { assignmentId: params.assignmentId, studentId: entry.studentId },
        },
        create: { assignmentId: params.assignmentId, studentId: entry.studentId, status: entry.status },
        update: { status: entry.status },
      })
    )
  );

  return { ok: true };
}

export { displayStatus, isOverdue };
