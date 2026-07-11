import type { PrismaClient } from "@prisma/client";
import { displayStatus } from "../assignments";

export interface ParentAssignmentHistoryEntry {
  id: number;
  subject: string;
  title: string;
  dueDate: string;
  status: "pending" | "submitted" | "overdue";
  className: string;
}

export async function getParentAssignmentHistory(
  prisma: PrismaClient,
  studentId: number
): Promise<ParentAssignmentHistoryEntry[]> {
  const statuses = await prisma.assignmentStatus.findMany({
    where: { studentId },
    include: { assignment: { include: { class: true } } },
    orderBy: { assignment: { dueDate: "desc" } },
  });

  return statuses.map((entry) => ({
    id: entry.assignment.id,
    subject: entry.assignment.subject,
    title: entry.assignment.title,
    dueDate: entry.assignment.dueDate.toISOString().slice(0, 10),
    status: displayStatus(entry.status, entry.assignment.dueDate),
    className: `${entry.assignment.class.name} ${entry.assignment.class.section}`,
  }));
}
