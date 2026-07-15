import type { PrismaClient } from "@prisma/client";
import { displayStatus } from "../assignments";

export interface ParentAssignmentHistoryEntry {
  id: number;
  subjectId: number;
  subjectName: string;
  title: string;
  dueDate: string;
  status: "pending" | "submitted" | "overdue";
  className: string;
}

export async function getParentAssignmentHistory(
  prisma: PrismaClient,
  studentId: number,
  options?: { status?: "pending" | "submitted" }
): Promise<ParentAssignmentHistoryEntry[]> {
  const statuses = await prisma.assignmentStatus.findMany({
    where: { studentId },
    include: { assignment: { include: { class: { include: { grade: true } }, subject: true } } },
    orderBy: { assignment: { dueDate: "desc" } },
  });

  const entries = statuses.map((entry) => ({
    id: entry.assignment.id,
    subjectId: entry.assignment.subjectId,
    subjectName: entry.assignment.subject.name,
    title: entry.assignment.title,
    dueDate: entry.assignment.dueDate.toISOString().slice(0, 10),
    status: displayStatus(entry.status, entry.assignment.dueDate),
    className: `${entry.assignment.class.grade.name} ${entry.assignment.class.section}`,
  }));

  if (options?.status === "pending") {
    return entries.filter((entry) => entry.status === "pending" || entry.status === "overdue");
  }
  if (options?.status === "submitted") {
    return entries.filter((entry) => entry.status === "submitted");
  }
  return entries;
}

export interface ParentAssignmentDetail extends ParentAssignmentHistoryEntry {
  description: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
}

export async function getParentAssignmentDetail(
  prisma: PrismaClient,
  params: { studentId: number; assignmentId: number }
): Promise<ParentAssignmentDetail | null> {
  const entry = await prisma.assignmentStatus.findUnique({
    where: { assignmentId_studentId: { assignmentId: params.assignmentId, studentId: params.studentId } },
    include: { assignment: { include: { class: { include: { grade: true } }, subject: true } } },
  });
  if (!entry) return null;

  return {
    id: entry.assignment.id,
    subjectId: entry.assignment.subjectId,
    subjectName: entry.assignment.subject.name,
    title: entry.assignment.title,
    dueDate: entry.assignment.dueDate.toISOString().slice(0, 10),
    status: displayStatus(entry.status, entry.assignment.dueDate),
    className: `${entry.assignment.class.grade.name} ${entry.assignment.class.section}`,
    description: entry.assignment.description,
    attachmentUrl: entry.assignment.attachmentUrl,
    attachmentName: entry.assignment.attachmentName,
  };
}
