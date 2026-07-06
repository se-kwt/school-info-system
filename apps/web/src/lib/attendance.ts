import type { PrismaClient, AttendanceStatus } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";

export interface RosterEntry {
  studentId: number;
  name: string;
  status: AttendanceStatus | null;
  note: string | null;
  monthPercent: number;
}

export type GetRosterResult =
  | { ok: true; students: RosterEntry[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function getAttendanceRoster(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    schoolId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<GetRosterResult> {
  if (params.role === "teacher") {
    const assignment = await prisma.classTeacher.findFirst({
      where: { classId: params.classId, teacherUserId: params.userId },
    });
    if (!assignment) {
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

  const targetDate = new Date(params.date);
  const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

  const students = await prisma.student.findMany({
    where: { classId: params.classId },
    orderBy: { name: "asc" },
    include: {
      attendance: {
        where: { date: { gte: monthStart, lt: monthEnd } },
      },
    },
  });

  const result: RosterEntry[] = students.map((student) => {
    const monthRecords = student.attendance;
    const attendedCount = monthRecords.filter(
      (record) => record.status === "present" || record.status === "late"
    ).length;
    const monthPercent =
      monthRecords.length === 0 ? 0 : Math.round((attendedCount / monthRecords.length) * 100);

    const todayRecord = monthRecords.find(
      (record) => record.date.toISOString().slice(0, 10) === params.date
    );

    return {
      studentId: student.id,
      name: student.name,
      status: todayRecord ? todayRecord.status : null,
      note: todayRecord ? todayRecord.note : null,
      monthPercent,
    };
  });

  return { ok: true, students: result };
}

export type MarkAttendanceResult =
  | { ok: true }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "STUDENT_MISMATCH" };

export async function markAttendance(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "present" | "absent" | "late"; note?: string }>;
  }
): Promise<MarkAttendanceResult> {
  const assignment = await prisma.classTeacher.findFirst({
    where: { classId: params.classId, teacherUserId: params.teacherUserId },
  });
  if (!assignment) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const studentCount = await prisma.student.count({
    where: {
      classId: params.classId,
      id: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (studentCount !== params.entries.length) {
    return { ok: false, error: "STUDENT_MISMATCH" };
  }

  const targetDate = new Date(params.date);

  await prisma.$transaction(
    params.entries.map((entry) =>
      prisma.attendance.upsert({
        where: { studentId_date: { studentId: entry.studentId, date: targetDate } },
        create: {
          studentId: entry.studentId,
          date: targetDate,
          status: entry.status,
          markedById: params.teacherUserId,
          note: entry.note ?? null,
        },
        update: {
          status: entry.status,
          markedById: params.teacherUserId,
          note: entry.note ?? null,
        },
      })
    )
  );

  return { ok: true };
}
