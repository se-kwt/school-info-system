import type { AttendanceStatus, PrismaClient } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { getEnrolledStudents } from "./enrollment";
import { getSchoolLocalToday } from "./date-utils";

export interface RosterEntry {
  studentId: number;
  name: string;
  rollNumber: string | null;
  photoUrl: string | null;
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
    academicYearId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<GetRosterResult> {
  if (params.role === "teacher") {
    const assignment = await prisma.classTeacher.findFirst({
      where: {
        classId: params.classId,
        teacherUserId: params.userId,
        academicYearId: params.academicYearId,
      },
    });
    if (!assignment) return { ok: false, error: "NOT_ASSIGNED" };
  } else {
    const klass = await prisma.class.findFirst({
      where: { id: params.classId, schoolId: params.schoolId },
    });
    if (!klass) return { ok: false, error: "INVALID_CLASS" };
  }

  const [year, month] = params.date.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  const enrolled = await getEnrolledStudents(prisma, {
    classId: params.classId,
    academicYearId: params.academicYearId,
  });

  const attendanceRows = await prisma.attendance.findMany({
    where: {
      studentId: { in: enrolled.map((student) => student.id) },
      date: { gte: monthStart, lt: monthEnd },
    },
  });

  return {
    ok: true,
    students: enrolled.map((student) => {
      const monthRecords = attendanceRows.filter((record) => record.studentId === student.id);
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
        rollNumber: student.rollNumber,
        photoUrl: student.photoUrl,
        status: todayRecord ? todayRecord.status : null,
        note: todayRecord ? todayRecord.note : null,
        monthPercent,
      };
    }),
  };
}

export type MarkAttendanceResult =
  | { ok: true }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "STUDENT_MISMATCH" }
  | { ok: false; error: "DATE_LOCKED" }
  | { ok: false; error: "DATE_OUTSIDE_YEAR" };

export async function markAttendance(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    academicYearId: number;
    schoolId: number;
    teacherUserId: number;
    role: SessionClaims["role"];
    entries: Array<{
      studentId: number;
      status: "present" | "absent" | "late" | "half_day" | "excused" | "holiday" | null;
      note?: string;
    }>;
  }
): Promise<MarkAttendanceResult> {
  if (params.role === "teacher") {
    const today = getSchoolLocalToday();
    if (params.date !== today) {
      return { ok: false, error: "DATE_LOCKED" };
    }

    const assignment = await prisma.classTeacher.findFirst({
      where: {
        classId: params.classId,
        teacherUserId: params.teacherUserId,
        academicYearId: params.academicYearId,
      },
    });
    if (!assignment) return { ok: false, error: "NOT_ASSIGNED" };
  } else {
    const klass = await prisma.class.findFirst({
      where: { id: params.classId, schoolId: params.schoolId },
    });
    if (!klass) return { ok: false, error: "NOT_ASSIGNED" };

    const year = await prisma.academicYear.findFirst({
      where: { id: params.academicYearId, schoolId: params.schoolId },
    });
    if (!year) return { ok: false, error: "NOT_ASSIGNED" };

    const target = new Date(params.date);
    if (target < year.startDate || target > year.endDate) {
      return { ok: false, error: "DATE_OUTSIDE_YEAR" };
    }
  }

  const enrolledCount = await prisma.enrollment.count({
    where: {
      classId: params.classId,
      academicYearId: params.academicYearId,
      status: "active",
      studentId: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (enrolledCount !== params.entries.length) return { ok: false, error: "STUDENT_MISMATCH" };

  const targetDate = new Date(params.date);
  await prisma.$transaction(
    params.entries.map((entry) =>
      entry.status === null
        ? prisma.attendance.deleteMany({
            where: { studentId: entry.studentId, date: targetDate },
          })
        : prisma.attendance.upsert({
            where: { studentId_date: { studentId: entry.studentId, date: targetDate } },
            create: {
              studentId: entry.studentId,
              academicYearId: params.academicYearId,
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
