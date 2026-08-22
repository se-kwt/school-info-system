import type { PrismaClient } from "@prisma/client";
import { buildAttendanceMonthDays, type ParentAttendanceDay } from "./overview";
import { attendancePercent } from "../attendance-status";

export interface ParentAttendanceMonth {
  year: number;
  month: number;
  monthLabel: string;
  percent: number;
  days: ParentAttendanceDay[];
  prevMonth: string;
  nextMonth: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseMonthParam(month: string | undefined): { year: number; month: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const zeroBasedMonth = Number(monthStr) - 1;
    if (zeroBasedMonth >= 0 && zeroBasedMonth <= 11) {
      return { year, month: zeroBasedMonth };
    }
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

function formatMonthParam(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export async function getParentAttendanceMonth(
  prisma: PrismaClient,
  params: { studentId: number; month?: string }
): Promise<ParentAttendanceMonth> {
  const { year, month } = parseMonthParam(params.month);
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  const attendanceRecords = await prisma.attendance.findMany({
    where: { studentId: params.studentId, date: { gte: start, lt: end } },
    select: { date: true, status: true, note: true },
  });

  const days = buildAttendanceMonthDays(attendanceRecords, year, month);
  const percent = attendancePercent(attendanceRecords);

  const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };

  return {
    year,
    month,
    monthLabel: `${MONTH_NAMES[month]} ${year}`,
    percent,
    days,
    prevMonth: formatMonthParam(prev.year, prev.month),
    nextMonth: formatMonthParam(next.year, next.month),
  };
}

export interface ParentAttendanceYearSummary {
  academicYearName: string;
  percent: number;
}

export async function getParentAttendanceYearSummary(
  prisma: PrismaClient,
  studentId: number
): Promise<ParentAttendanceYearSummary | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: "active" },
    include: { academicYear: true },
  });

  if (!enrollment) return null;

  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      studentId,
      date: { gte: enrollment.academicYear.startDate, lte: enrollment.academicYear.endDate },
    },
    select: { status: true },
  });

  return {
    academicYearName: enrollment.academicYear.name,
    percent: attendancePercent(attendanceRecords),
  };
}
