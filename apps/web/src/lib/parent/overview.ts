import type { PrismaClient, Student } from "@prisma/client";
import { displayStatus } from "../assignments";

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
        include: { class: true },
      });
      return {
        id: child.id,
        name: child.name,
        className: enrollment ? `${enrollment.class.name} ${enrollment.class.section}` : null,
      };
    })
  );
}

export interface ParentAssignmentEntry {
  id: number;
  subject: string;
  title: string;
  dueDate: string;
  status: "pending" | "overdue";
}

export interface ParentExamSubject {
  subject: string;
  marksObtained: number;
  maxMarks: number;
  grade: string;
}

export interface ParentAttendanceDay {
  date: string;
  dayOfMonth: number;
  weekday: number;
  status: "present" | "absent" | "late" | null;
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

function attendancePercent(records: { status: string }[]): number {
  if (records.length === 0) return 0;
  const attended = records.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

export async function getParentOverview(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number }
): Promise<ParentOverview> {
  const { start, end } = monthRange();
  const attendanceRecords = await prisma.attendance.findMany({
    where: { studentId: params.studentId, date: { gte: start, lt: end } },
    select: { date: true, status: true },
  });
  const attendanceMonthPercent = attendancePercent(attendanceRecords);

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const attendanceDays: ParentAttendanceDay[] = [];
  for (let day = 1; day <= totalDays; day++) {
    const cellDate = new Date(Date.UTC(year, month, day));
    const dateStr = cellDate.toISOString().slice(0, 10);
    const record = attendanceRecords.find((r) => r.date.toISOString().slice(0, 10) === dateStr);
    attendanceDays.push({
      date: dateStr,
      dayOfMonth: day,
      weekday: cellDate.getUTCDay(),
      status: record ? record.status : null,
    });
  }

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
      include: { assignment: true },
      orderBy: { assignment: { dueDate: "asc" } },
      take: 3,
    });
    upcomingAssignments = pendingStatuses.map((entry) => ({
      id: entry.assignment.id,
      subject: entry.assignment.subject,
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
    });
    latestExam = {
      examName: latestMark.exam.name,
      term: latestMark.exam.term,
      subjects: examMarks.map((mark) => ({
        subject: mark.subject,
        marksObtained: mark.marksObtained,
        maxMarks: mark.maxMarks,
        grade: mark.grade,
      })),
    };
  }

  return { attendanceMonthPercent, attendanceDays, upcomingAssignments, latestExam, feesOutstanding };
}
