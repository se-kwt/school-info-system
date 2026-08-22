import type { PrismaClient, Student } from "@prisma/client";
import { displayStatus } from "../assignments";
import { attendanceWeight, type AttendanceStatusValue } from "../attendance-status";

export async function getParentChildren(
  prisma: PrismaClient,
  parentUserId: number
): Promise<Student[]> {
  const links = await prisma.parentStudent.findMany({
    where: { parentUserId },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });
  return links.map((link) => link.student);
}

export interface ParentChildWithClass {
  id: number;
  name: string;
  className: string | null;
}

export async function getParentChildrenWithClass(
  prisma: PrismaClient,
  parentUserId: number
): Promise<ParentChildWithClass[]> {
  const children = await getParentChildren(prisma, parentUserId);

  return Promise.all(
    children.map(async (child) => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { studentId: child.id, status: "active" },
        include: { class: { include: { grade: true } } },
      });
      return {
        id: child.id,
        name: child.name,
        className: enrollment ? `${enrollment.class.grade.name} ${enrollment.class.section}` : null,
      };
    })
  );
}

export interface ParentAssignmentEntry {
  id: number;
  subjectId: number;
  subjectName: string;
  title: string;
  dueDate: string;
  status: "pending" | "overdue";
}

export interface ParentExamSubject {
  subjectId: number;
  subjectName: string;
  marksObtained: number;
  maxMarks: number;
  grade: string;
}

export interface ParentAttendanceDay {
  date: string;
  dayOfMonth: number;
  weekday: number;
  status: "present" | "absent" | "late" | "half_day" | "excused" | "holiday" | null;
  note?: string | null;
}

export interface ParentOverview {
  attendanceMonthPercent: number;
  attendanceDays: ParentAttendanceDay[];
  upcomingAssignments: ParentAssignmentEntry[];
  latestExam: { examName: string; term: string; subjects: ParentExamSubject[] } | null;
  feesOutstanding: { amount: number; nearestDueDate: string | null };
}

function monthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export function attendancePercent(records: { status: string }[]): number {
  const weighted = records.reduce(
    (acc, r) => {
      const { counted, credit } = attendanceWeight(r.status as Exclude<AttendanceStatusValue, null>);
      return counted ? { total: acc.total + 1, credit: acc.credit + credit } : acc;
    },
    { total: 0, credit: 0 }
  );
  return weighted.total === 0 ? 0 : Math.round((weighted.credit / weighted.total) * 100);
}

export function buildAttendanceMonthDays(
  records: { date: Date; status: string; note?: string | null }[],
  year: number,
  month: number
): ParentAttendanceDay[] {
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const days: ParentAttendanceDay[] = [];
  for (let day = 1; day <= totalDays; day++) {
    const cellDate = new Date(Date.UTC(year, month, day));
    const dateStr = cellDate.toISOString().slice(0, 10);
    const record = records.find((r) => r.date.toISOString().slice(0, 10) === dateStr);
    days.push({
      date: dateStr,
      dayOfMonth: day,
      weekday: cellDate.getUTCDay(),
      status: (record?.status as ParentAttendanceDay["status"]) ?? null,
      note: record?.note ?? null,
    });
  }
  return days;
}

export async function getParentOverview(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number }
): Promise<ParentOverview> {
  const { start, end } = monthRange();
  const attendanceRecords = await prisma.attendance.findMany({
    where: { studentId: params.studentId, date: { gte: start, lt: end } },
    select: { date: true, status: true, note: true },
  });
  const attendanceMonthPercent = attendancePercent(attendanceRecords);

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const attendanceDays = buildAttendanceMonthDays(attendanceRecords, year, month);

  const activeEnrollment = await prisma.enrollment.findFirst({
    where: { studentId: params.studentId, status: "active" },
  });

  let upcomingAssignments: ParentAssignmentEntry[] = [];
  let feesOutstanding: ParentOverview["feesOutstanding"] = { amount: 0, nearestDueDate: null };

  if (activeEnrollment) {
    const pendingStatuses = await prisma.assignmentStatus.findMany({
      where: {
        studentId: params.studentId,
        status: "pending",
        assignment: {
          classId: activeEnrollment.classId,
          academicYearId: activeEnrollment.academicYearId,
        },
      },
      include: { assignment: { include: { subject: true } } },
      orderBy: { assignment: { dueDate: "asc" } },
      take: 3,
    });
    upcomingAssignments = pendingStatuses.map((entry) => ({
      id: entry.assignment.id,
      subjectId: entry.assignment.subjectId,
      subjectName: entry.assignment.subject.name,
      title: entry.assignment.title,
      dueDate: entry.assignment.dueDate.toISOString().slice(0, 10),
      status: displayStatus(entry.status, entry.assignment.dueDate) === "overdue" ? "overdue" : "pending",
    }));

    const feeStructures = await prisma.feeStructure.findMany({
      where: { classId: activeEnrollment.classId, academicYearId: activeEnrollment.academicYearId },
      include: { payments: { where: { studentId: params.studentId } } },
      orderBy: { dueDate: "asc" },
    });
    let totalOutstanding = 0;
    let nearestDueDate: string | null = null;
    for (const structure of feeStructures) {
      const paid = structure.payments[0]?.amountPaid ?? 0;
      const outstanding = Math.max(0, structure.amount - paid);
      totalOutstanding += outstanding;
      if (outstanding > 0 && nearestDueDate === null) {
        nearestDueDate = structure.dueDate.toISOString().slice(0, 10);
      }
    }
    feesOutstanding = { amount: totalOutstanding, nearestDueDate };
  }

  const latestMark = await prisma.mark.findFirst({
    where: { studentId: params.studentId },
    include: { exam: true },
    orderBy: { exam: { examDate: "desc" } },
  });

  let latestExam: ParentOverview["latestExam"] = null;
  if (latestMark) {
    const examMarks = await prisma.mark.findMany({
      where: { studentId: params.studentId, examId: latestMark.examId },
      include: { subject: true },
    });
    latestExam = {
      examName: latestMark.exam.name,
      term: latestMark.exam.term,
      subjects: examMarks.map((mark) => ({
        subjectId: mark.subjectId,
        subjectName: mark.subject.name,
        marksObtained: mark.marksObtained,
        maxMarks: mark.maxMarks,
        grade: mark.grade,
      })),
    };
  }

  return { attendanceMonthPercent, attendanceDays, upcomingAssignments, latestExam, feesOutstanding };
}
