import type { PrismaClient } from "@prisma/client";
import type { SessionClaims } from "@/lib/auth/jwt";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { getSchoolLocalTodayStart } from "@/lib/date-utils";
import { attendancePercent } from "@/lib/attendance-status";

export interface ClassPerformanceEntry {
  classId: number;
  name: string;
  section: string;
  attendancePercent: number;
}

export interface AttendanceTrendPoint {
  date: string;
  classId: number;
  className: string;
  percent: number;
}

export interface StaffOverviewEntry {
  userId: number;
  name: string;
  classCount: number;
}

export interface AssignmentDueEntry {
  id: number;
  className: string;
  subjectId: number;
  subjectName: string;
  title: string;
  dueDate: string;
  status: "pending" | "submitted" | "overdue";
}

export interface TimetablePeriodEntry {
  id: number;
  periodOrder: number;
  periodLabel: string;
  subjectId: number;
  subjectName: string;
  className: string;
  teacherName: string | null;
}

export interface AcademicOverview {
  role: "teacher" | "admin";
  totalStudents: number;
  todayAttendancePercent: number | null;
  upcomingCount: number;
  feesCollectedThisTerm: number;
  classPerformance: ClassPerformanceEntry[];
  attendanceTrend: AttendanceTrendPoint[];
  staffCapacityPercent: number;
  staffOverview: StaffOverviewEntry[];
  assignmentsDue: AssignmentDueEntry[];
  todaysTimetable: TimetablePeriodEntry[];
}

export interface FeeStructureCollectionEntry {
  id: number;
  term: string;
  className: string;
  totalDue: number;
  totalPaid: number;
  collectionPercent: number;
}

export interface RecentPaymentEntry {
  id: number;
  studentName: string;
  className: string;
  amountPaid: number;
  paidDate: string | null;
}

export interface FeesOverview {
  role: "accountant";
  feesCollectedThisTerm: number;
  outstandingAmount: number;
  activeFeeStructures: number;
  paymentsRecordedToday: number;
  feeStructureCollection: FeeStructureCollectionEntry[];
  recentPayments: RecentPaymentEntry[];
}

export type DashboardOverview = AcademicOverview | FeesOverview;

function startOfToday(): Date {
  return getSchoolLocalTodayStart();
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export async function getDashboardOverview(
  prisma: PrismaClient,
  claims: SessionClaims
): Promise<DashboardOverview> {
  if (claims.role === "accountant") {
    return getFeesOverview(prisma, claims.schoolId);
  }
  return getAcademicOverview(prisma, claims);
}

async function getAcademicOverview(
  prisma: PrismaClient,
  claims: SessionClaims
): Promise<AcademicOverview> {
  const role = claims.role === "teacher" ? "teacher" : "admin";
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const academicYearId = activeYear?.id ?? -1;

  const classes =
    role === "teacher"
      ? await getClassesForTeacher(prisma, claims.userId, academicYearId)
      : await listClasses(prisma, claims.schoolId);
  const classIds = classes.map((klass) => klass.id);

  const totalStudents = await prisma.enrollment.count({
    where: { classId: { in: classIds }, academicYearId, status: "active" },
  });

  const todayStart = startOfToday();
  const todayEnd = addDays(todayStart, 1);

  const todayAttendance = await prisma.attendance.findMany({
    where: {
      date: { gte: todayStart, lt: todayEnd },
      student: {
        enrollments: { some: { classId: { in: classIds }, academicYearId, status: "active" } },
      },
    },
    select: { status: true },
  });
  const todayAttendancePercent =
    todayAttendance.length === 0 ? null : attendancePercent(todayAttendance);

  const in7Days = addDays(todayStart, 7);
  const [assignmentsDueCount, examsDueCount] = await Promise.all([
    prisma.assignment.count({
      where: { classId: { in: classIds }, dueDate: { gte: todayStart, lte: in7Days } },
    }),
    prisma.exam.count({
      where: {
        schoolId: claims.schoolId,
        academicYearId,
        examDate: { gte: todayStart, lte: in7Days },
      },
    }),
  ]);
  const upcomingCount = assignmentsDueCount + examsDueCount;

  const feeStructures = await prisma.feeStructure.findMany({
    where: { classId: { in: classIds } },
    orderBy: { dueDate: "desc" },
  });
  const latestDueDate = feeStructures[0]?.dueDate ?? null;
  const currentTermStructureIds = feeStructures
    .filter((fs) => latestDueDate && fs.dueDate.getTime() === latestDueDate.getTime())
    .map((fs) => fs.id);
  const feesCollectedThisTerm =
    currentTermStructureIds.length === 0
      ? 0
      : ((
          await prisma.feePayment.aggregate({
            where: { feeStructureId: { in: currentTermStructureIds } },
            _sum: { amountPaid: true },
          })
        )._sum.amountPaid ?? 0);

  const thirtyDaysAgo = addDays(todayStart, -30);
  const classIdSet = new Set(classes.map((k) => k.id));
  const allAttendanceRecords = await prisma.attendance.findMany({
    where: {
      date: { gte: thirtyDaysAgo, lt: todayEnd },
      student: {
        enrollments: { some: { classId: { in: [...classIdSet] }, academicYearId, status: "active" } },
      },
    },
    select: {
      status: true,
      student: {
        select: {
          enrollments: {
            where: { classId: { in: [...classIdSet] }, academicYearId, status: "active" },
            select: { classId: true },
            take: 1,
          },
        },
      },
    },
  });

  const recordsByClassId = new Map<number, { status: string }[]>();
  for (const record of allAttendanceRecords) {
    const classId = record.student.enrollments[0]?.classId;
    if (classId === undefined) continue;
    const bucket = recordsByClassId.get(classId) ?? [];
    bucket.push({ status: record.status });
    recordsByClassId.set(classId, bucket);
  }

  const classPerformance: ClassPerformanceEntry[] = classes.map((klass) => ({
    classId: klass.id,
    name: klass.gradeName,
    section: klass.section,
    attendancePercent: attendancePercent(recordsByClassId.get(klass.id) ?? []),
  }));
  classPerformance.sort((a, b) => b.attendancePercent - a.attendancePercent);
  const topClasses = classPerformance.slice(0, 5);
  const trendClasses = topClasses.slice(0, 3);

  const trendClassIds = trendClasses.map((c) => c.classId);
  const trendStart = addDays(todayStart, -4);
  const trendRecords = await prisma.attendance.findMany({
    where: {
      date: { gte: trendStart, lt: todayEnd },
      student: {
        enrollments: { some: { classId: { in: trendClassIds }, academicYearId, status: "active" } },
      },
    },
    select: {
      date: true,
      status: true,
      student: {
        select: {
          enrollments: {
            where: { classId: { in: trendClassIds }, academicYearId, status: "active" },
            select: { classId: true },
            take: 1,
          },
        },
      },
    },
  });

  const trendBuckets = new Map<string, { status: string }[]>(); // key: `${dateStr}:${classId}`
  for (const record of trendRecords) {
    const classId = record.student.enrollments[0]?.classId;
    if (classId === undefined) continue;
    const key = `${record.date.toISOString().slice(0, 10)}:${classId}`;
    const bucket = trendBuckets.get(key) ?? [];
    bucket.push({ status: record.status });
    trendBuckets.set(key, bucket);
  }

  const attendanceTrend: AttendanceTrendPoint[] = [];
  for (let i = 4; i >= 0; i--) {
    const day = addDays(todayStart, -i);
    const dateStr = day.toISOString().slice(0, 10);
    for (const klass of trendClasses) {
      const records = trendBuckets.get(`${dateStr}:${klass.classId}`) ?? [];
      if (records.length === 0) continue;
      attendanceTrend.push({
        date: dateStr,
        classId: klass.classId,
        className: `${klass.name} ${klass.section}`,
        percent: attendancePercent(records),
      });
    }
  }

  const classTeacherLinks = await prisma.classTeacher.findMany({
    where: { classId: { in: classIds } },
    include: { teacher: true },
  });
  const staffByUserId = new Map<number, StaffOverviewEntry>();
  for (const link of classTeacherLinks) {
    const existing = staffByUserId.get(link.teacherUserId);
    if (existing) {
      existing.classCount += 1;
    } else {
      staffByUserId.set(link.teacherUserId, {
        userId: link.teacherUserId,
        name: link.teacher.name,
        classCount: 1,
      });
    }
  }
  const staffOverview = Array.from(staffByUserId.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const attendanceTodayRows = await prisma.attendance.findMany({
    where: {
      date: { gte: todayStart, lt: todayEnd },
      student: {
        enrollments: { some: { classId: { in: classIds }, academicYearId, status: "active" } },
      },
    },
    select: {
      student: {
        select: { enrollments: { where: { academicYearId }, select: { classId: true } } },
      },
    },
  });
  const classesMarkedToday = new Set(
    attendanceTodayRows
      .map((row) => row.student.enrollments[0]?.classId)
      .filter((classId): classId is number => classId !== undefined)
  ).size;
  const staffCapacityPercent =
    classIds.length === 0 ? 0 : Math.round((classesMarkedToday / classIds.length) * 100);

  const dueAssignments = await prisma.assignment.findMany({
    where: { classId: { in: classIds } },
    include: { class: { include: { grade: true } }, statuses: true, subject: true },
    orderBy: { dueDate: "asc" },
    take: 8,
  });
  const assignmentsDue: AssignmentDueEntry[] = dueAssignments.map((assignment) => {
    const hasOverdue = assignment.statuses.some(
      (s) => s.status === "pending" && assignment.dueDate < todayStart
    );
    const allSubmitted =
      assignment.statuses.length > 0 && assignment.statuses.every((s) => s.status === "submitted");
    const status: AssignmentDueEntry["status"] = hasOverdue
      ? "overdue"
      : allSubmitted
        ? "submitted"
        : "pending";
    return {
      id: assignment.id,
      className: `${assignment.class.grade.name} ${assignment.class.section}`,
      subjectId: assignment.subjectId,
      subjectName: assignment.subject.name,
      title: assignment.title,
      dueDate: assignment.dueDate.toISOString().slice(0, 10),
      status,
    };
  });

  const todayDayOfWeek = new Date().getDay();
  const todaysTimetableRows = await prisma.timetableEntry.findMany({
    where: { classId: { in: classIds }, dayOfWeek: todayDayOfWeek },
    include: { class: { include: { grade: true } }, teacher: true, subject: true, period: true },
    orderBy: { period: { order: "asc" } },
  });
  const todaysTimetable: TimetablePeriodEntry[] = todaysTimetableRows.map((entry) => ({
    id: entry.id,
    periodOrder: entry.period.order,
    periodLabel: entry.period.label,
    subjectId: entry.subjectId,
    subjectName: entry.subject.name,
    className: `${entry.class.grade.name} ${entry.class.section}`,
    teacherName: entry.teacher?.name ?? null,
  }));

  return {
    role,
    totalStudents,
    todayAttendancePercent,
    upcomingCount,
    feesCollectedThisTerm,
    classPerformance: topClasses,
    attendanceTrend,
    staffCapacityPercent,
    staffOverview,
    assignmentsDue,
    todaysTimetable,
  };
}

async function getFeesOverview(prisma: PrismaClient, schoolId: number): Promise<FeesOverview> {
  const feeStructures = await prisma.feeStructure.findMany({
    where: { schoolId },
    include: { class: { include: { grade: true } }, payments: true },
    orderBy: { dueDate: "desc" },
  });

  const latestDueDate = feeStructures[0]?.dueDate ?? null;
  const currentTermStructures = feeStructures.filter(
    (fs) => latestDueDate && fs.dueDate.getTime() === latestDueDate.getTime()
  );
  const feesCollectedThisTerm = currentTermStructures.reduce(
    (sum, fs) => sum + fs.payments.reduce((s, p) => s + p.amountPaid, 0),
    0
  );

  // FeeStructure.amount is a per-student amount, so the true amount due for a
  // fee structure is that amount multiplied by the number of students in its
  // class. Compare totals against totals, not a per-student amount against a
  // class-wide sum of payments.
  const classIds = [...new Set(feeStructures.map((fs) => fs.classId))];
  const activeYear = await getActiveAcademicYear(prisma, schoolId);
  const studentCounts = await prisma.enrollment.groupBy({
    by: ["classId"],
    where: { classId: { in: classIds }, academicYearId: activeYear?.id ?? -1, status: "active" },
    _count: true,
  });
  const studentCountByClassId = new Map<number, number>(
    studentCounts.map((row) => [row.classId, row._count])
  );

  const outstandingAmount = feeStructures.reduce((sum, fs) => {
    const paid = fs.payments.reduce((s, p) => s + p.amountPaid, 0);
    const totalDue = fs.amount * (studentCountByClassId.get(fs.classId) ?? 0);
    return sum + Math.max(0, totalDue - paid);
  }, 0);

  const feeStructureCollection: FeeStructureCollectionEntry[] = feeStructures.map((fs) => {
    const totalPaid = fs.payments.reduce((s, p) => s + p.amountPaid, 0);
    const totalDue = fs.amount * (studentCountByClassId.get(fs.classId) ?? 0);
    return {
      id: fs.id,
      term: fs.term,
      className: `${fs.class.grade.name} ${fs.class.section}`,
      totalDue,
      totalPaid,
      collectionPercent: totalDue === 0 ? 0 : Math.round((totalPaid / totalDue) * 100),
    };
  });

  const todayStart = startOfToday();
  const todayEnd = addDays(todayStart, 1);
  const paymentsRecordedToday = await prisma.feePayment.count({
    where: { feeStructure: { schoolId }, paidDate: { gte: todayStart, lt: todayEnd } },
  });

  const recentPaymentRows = await prisma.feePayment.findMany({
    where: { feeStructure: { schoolId } },
    include: { student: true, feeStructure: { include: { class: { include: { grade: true } } } } },
    orderBy: { paidDate: "desc" },
    take: 8,
  });
  const recentPayments: RecentPaymentEntry[] = recentPaymentRows.map((payment) => ({
    id: payment.id,
    studentName: payment.student.name,
    className: `${payment.feeStructure.class.grade.name} ${payment.feeStructure.class.section}`,
    amountPaid: payment.amountPaid,
    paidDate: payment.paidDate ? payment.paidDate.toISOString().slice(0, 10) : null,
  }));

  return {
    role: "accountant",
    feesCollectedThisTerm,
    outstandingAmount,
    activeFeeStructures: feeStructures.length,
    paymentsRecordedToday,
    feeStructureCollection,
    recentPayments,
  };
}
