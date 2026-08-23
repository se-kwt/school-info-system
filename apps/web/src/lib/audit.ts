import type { PrismaClient } from "@prisma/client";

export async function recordAttendanceChange(
  prisma: PrismaClient,
  params: {
    studentId: number;
    date: Date;
    fromStatus: string;
    toStatus: string;
    actorUserId: number;
  }
): Promise<void> {
  if (params.fromStatus === params.toStatus) return;

  await prisma.recordCorrection.create({
    data: {
      entity: "attendance",
      studentId: params.studentId,
      date: params.date,
      fromValue: params.fromStatus,
      toValue: params.toStatus,
      actorUserId: params.actorUserId,
    },
  });
}

export async function recordMarkChange(
  prisma: PrismaClient,
  params: {
    studentId: number;
    examId: number;
    subjectId: number;
    fromValue: number;
    toValue: number;
    actorUserId: number;
  }
): Promise<void> {
  if (params.fromValue === params.toValue) return;

  await prisma.recordCorrection.create({
    data: {
      entity: "mark",
      studentId: params.studentId,
      examId: params.examId,
      subjectId: params.subjectId,
      fromValue: String(params.fromValue),
      toValue: String(params.toValue),
      actorUserId: params.actorUserId,
    },
  });
}

export function isRecordChanged(before: unknown, after: unknown): boolean {
  return before !== after;
}
