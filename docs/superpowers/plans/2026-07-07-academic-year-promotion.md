# Academic Year Management & Promotion Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit an `AcademicYear` concept onto the schema (replacing `Student.classId` with a per-year `Enrollment`), then build an admin-only Promotion Wizard that creates a new academic year and transitions students into it.

**Architecture:** Task 1 is a single large "foundation" change: schema migration + every existing module's query sites + every existing test fixture, landed atomically because the existing test suite cannot pass in between (Student loses its `classId` field entirely). Tasks 2+ build the net-new Academic Year and Promotion features on top of that now-consistent foundation, each independently testable.

**Tech Stack:** Next.js 14 route handlers, Prisma 5 (PostgreSQL), Vitest with a real Postgres test database (no mocking of Prisma), following the exact patterns already in `src/lib/fee-payments.ts` / `src/app/api/fee-payments/route.ts`.

## Global Constraints

- No real school has gone live on this system yet — this is a clean schema redesign, not a production migration. No backward-compatibility shims.
- Every mutating lib function returns a `{ ok: true, ... } | { ok: false, error: "..." }` result type — never throws for expected validation failures (matches every existing module).
- Every route handler follows the `requireApiRole` + try/catch `AuthError` pattern already used in every existing route.
- `academicYearId` is resolved server-side (defaulting to the school's active year) rather than trusted blindly from the client, via a shared `resolveAcademicYear` helper (Task 1).
- A year-switcher UI for browsing *past* archived years' data on the Attendance/Marks/Timetable/Assignments/Fees pages is **out of scope for this plan** — those pages continue to only show the active year. The API layer's `academicYearId` param support (Task 1) makes this a follow-up UI-only enhancement later; flag this to the user before starting.

---

## Task 1: Core Schema Retrofit — AcademicYear, Enrollment, and every existing module

This task is large by necessity: the schema change removes `Student.classId`, so every module that reads it (Attendance, Marks, Timetable, Assignments, Fees, Students/Staff admin) breaks simultaneously and must be fixed in the same commit for the test suite to pass again. Sub-steps below are ordered so you can verify incrementally with `npx tsc --noEmit` even though the full test suite only goes green at the end.

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev --name academic_year_and_enrollment`
- Create: `apps/web/src/lib/academic-years.ts`
- Create: `apps/web/src/lib/enrollment.ts`
- Modify: `apps/web/prisma/fixtures.ts`, `apps/web/prisma/seed.ts`, `apps/web/tests/helpers/db.ts`
- Create: `apps/web/tests/helpers/enrollment.ts`
- Modify: `apps/web/src/lib/attendance.ts`, `apps/web/src/lib/marks.ts`, `apps/web/src/lib/timetable.ts`, `apps/web/src/lib/assignments.ts`, `apps/web/src/lib/exams.ts`, `apps/web/src/lib/fee-structures.ts`, `apps/web/src/lib/fee-payments.ts`, `apps/web/src/lib/school-setup/students.ts`, `apps/web/src/lib/school-setup/staff.ts`, `apps/web/src/lib/data/scoped-queries.ts`
- Modify: `apps/web/src/app/api/attendance/route.ts`, `apps/web/src/app/api/marks/route.ts`, `apps/web/src/app/api/exams/route.ts`, `apps/web/src/app/api/timetable/route.ts`, `apps/web/src/app/api/assignments/route.ts`, `apps/web/src/app/api/fee-structures/route.ts`, `apps/web/src/app/api/students/route.ts`, `apps/web/src/app/api/staff/route.ts`
- Modify tests: `apps/web/tests/attendance-api.test.ts`, `apps/web/tests/marks-api.test.ts`, `apps/web/tests/timetable-api.test.ts`, `apps/web/tests/assignments-api.test.ts`, `apps/web/tests/fee-payments-api.test.ts`, `apps/web/tests/fee-structures-api.test.ts`, `apps/web/tests/students-api.test.ts`, `apps/web/tests/exams-api.test.ts`

**Interfaces produced (used by later tasks):**
- `getActiveAcademicYear(prisma, schoolId): Promise<AcademicYear | null>`
- `resolveAcademicYear(prisma, schoolId, requestedId?: number): Promise<{ ok: true; academicYear: AcademicYear } | { ok: false; error: "INVALID_ACADEMIC_YEAR" }>`
- `getEnrolledStudents(prisma, { classId, academicYearId }): Promise<{ id: number; name: string }[]>`

### Step 1: Write the new schema

- [ ] Replace `apps/web/prisma/schema.prisma` with the following complete file:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  parent
  teacher
  admin
  accountant
}

enum AttendanceStatus {
  present
  absent
  late
}

enum AssignmentStatusValue {
  pending
  submitted
  overdue
}

enum FeeStatus {
  paid
  partial
  unpaid
}

enum AcademicYearStatus {
  upcoming
  active
  archived
}

enum EnrollmentStatus {
  active
  promoted
  retained
  left
  transferred
  graduated
  inactive
}

enum PromotionRunStatus {
  draft
  confirmed
  reverted
}

enum StudentStatus {
  active
  left
  transferred
  graduated
  inactive
}

model School {
  id            Int            @id @default(autoincrement())
  name          String
  users         User[]
  students      Student[]
  classes       Class[]
  exams         Exam[]
  feeStructures FeeStructure[]
  academicYears AcademicYear[]
  promotionRuns PromotionRun[]
}

model User {
  id       Int    @id @default(autoincrement())
  phone    String @unique
  role     Role
  name     String
  school   School @relation(fields: [schoolId], references: [id])
  schoolId Int

  parentLinks         ParentStudent[]
  classesTaught       ClassTeacher[]
  attendanceMarked    Attendance[]      @relation("MarkedBy")
  assignmentsCreated  Assignment[]
  feePaymentsRecorded FeePayment[]      @relation("RecordedBy")
  notifications       Notification[]
  timetableEntries    TimetableEntry[]
  promotionRunsRun    PromotionRun[]
}

model Student {
  id          Int           @id @default(autoincrement())
  school      School        @relation(fields: [schoolId], references: [id])
  schoolId    Int
  name        String
  dob         DateTime
  admissionNo String        @unique
  status      StudentStatus @default(active)

  parentLinks         ParentStudent[]
  attendance          Attendance[]
  assignmentStatuses  AssignmentStatus[]
  marks               Mark[]
  feePayments         FeePayment[]
  enrollments         Enrollment[]
  promotionLogEntries PromotionLogEntry[]
}

model ParentStudent {
  id           Int     @id @default(autoincrement())
  parent       User    @relation(fields: [parentUserId], references: [id])
  parentUserId Int
  student      Student @relation(fields: [studentId], references: [id])
  studentId    Int

  @@unique([parentUserId, studentId])
}

model Class {
  id       Int    @id @default(autoincrement())
  school   School @relation(fields: [schoolId], references: [id])
  schoolId Int
  name     String
  section  String

  students         Student[]
  teacherLinks     ClassTeacher[]
  assignments      Assignment[]
  timetableEntries TimetableEntry[]
  feeStructures    FeeStructure[]
  enrollments      Enrollment[]
  mappingsFrom     PromotionMapping[] @relation("MappingFrom")
  mappingsTo       PromotionMapping[] @relation("MappingTo")

  @@unique([schoolId, name, section])
}

model ClassTeacher {
  id             Int          @id @default(autoincrement())
  class          Class        @relation(fields: [classId], references: [id])
  classId        Int
  teacher        User         @relation(fields: [teacherUserId], references: [id])
  teacherUserId  Int
  subject        String
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  academicYearId Int

  @@unique([classId, teacherUserId, subject, academicYearId])
}

model Attendance {
  id         Int              @id @default(autoincrement())
  student    Student          @relation(fields: [studentId], references: [id])
  studentId  Int
  date       DateTime
  status     AttendanceStatus
  markedBy   User             @relation("MarkedBy", fields: [markedById], references: [id])
  markedById Int
  note       String?

  @@unique([studentId, date])
}

model Assignment {
  id             Int          @id @default(autoincrement())
  class          Class        @relation(fields: [classId], references: [id])
  classId        Int
  subject        String
  title          String
  description    String?
  dueDate        DateTime
  createdBy      User         @relation(fields: [createdById], references: [id])
  createdById    Int
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  academicYearId Int

  statuses AssignmentStatus[]
}

model AssignmentStatus {
  id           Int                   @id @default(autoincrement())
  assignment   Assignment            @relation(fields: [assignmentId], references: [id])
  assignmentId Int
  student      Student               @relation(fields: [studentId], references: [id])
  studentId    Int
  status       AssignmentStatusValue @default(pending)

  @@unique([assignmentId, studentId])
}

model Exam {
  id             Int          @id @default(autoincrement())
  school         School       @relation(fields: [schoolId], references: [id])
  schoolId       Int
  name           String
  term           String
  examDate       DateTime
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  academicYearId Int

  marks Mark[]
}

model Mark {
  id            Int     @id @default(autoincrement())
  exam          Exam    @relation(fields: [examId], references: [id])
  examId        Int
  student       Student @relation(fields: [studentId], references: [id])
  studentId     Int
  subject       String
  marksObtained Float
  maxMarks      Float
  grade         String

  @@unique([examId, studentId, subject])
}

model TimetableEntry {
  id             Int          @id @default(autoincrement())
  class          Class        @relation(fields: [classId], references: [id])
  classId        Int
  dayOfWeek      Int
  period         Int
  subject        String
  teacher        User?        @relation(fields: [teacherUserId], references: [id])
  teacherUserId  Int?
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  academicYearId Int

  @@unique([classId, dayOfWeek, period, academicYearId])
}

model FeeStructure {
  id             Int          @id @default(autoincrement())
  school         School       @relation(fields: [schoolId], references: [id])
  schoolId       Int
  class          Class        @relation(fields: [classId], references: [id])
  classId        Int
  term           String
  amount         Float
  dueDate        DateTime
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  academicYearId Int

  payments FeePayment[]
}

model FeePayment {
  id             Int          @id @default(autoincrement())
  student        Student      @relation(fields: [studentId], references: [id])
  studentId      Int
  feeStructure   FeeStructure @relation(fields: [feeStructureId], references: [id])
  feeStructureId Int
  amountPaid     Float
  paidDate       DateTime?
  recordedBy     User         @relation("RecordedBy", fields: [recordedById], references: [id])
  recordedById   Int
  status         FeeStatus    @default(unpaid)

  @@unique([studentId, feeStructureId])
}

model Notification {
  id        Int       @id @default(autoincrement())
  user      User      @relation(fields: [userId], references: [id])
  userId    Int
  type      String
  title     String
  body      String
  relatedId Int?
  readAt    DateTime?
  createdAt DateTime  @default(now())
}

model OtpCode {
  id        Int       @id @default(autoincrement())
  phone     String
  codeHash  String
  salt      String
  expiresAt DateTime
  attempts  Int       @default(0)
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}

model AcademicYear {
  id        Int                @id @default(autoincrement())
  school    School             @relation(fields: [schoolId], references: [id])
  schoolId  Int
  name      String
  startDate DateTime
  endDate   DateTime
  status    AcademicYearStatus @default(upcoming)

  enrollments      Enrollment[]
  classTeachers    ClassTeacher[]
  timetableEntries TimetableEntry[]
  feeStructures    FeeStructure[]
  exams            Exam[]
  assignments      Assignment[]
  runsFrom         PromotionRun[] @relation("FromYear")
  runsTo           PromotionRun[] @relation("ToYear")

  @@unique([schoolId, name])
}

model Enrollment {
  id             Int              @id @default(autoincrement())
  student        Student          @relation(fields: [studentId], references: [id])
  studentId      Int
  class          Class            @relation(fields: [classId], references: [id])
  classId        Int
  academicYear   AcademicYear     @relation(fields: [academicYearId], references: [id])
  academicYearId Int
  rollNumber     String?
  status         EnrollmentStatus @default(active)
  createdAt      DateTime         @default(now())

  @@unique([studentId, academicYearId])
}

model PromotionRun {
  id                 Int                 @id @default(autoincrement())
  school             School              @relation(fields: [schoolId], references: [id])
  schoolId           Int
  fromAcademicYear   AcademicYear        @relation("FromYear", fields: [fromAcademicYearId], references: [id])
  fromAcademicYearId Int
  toAcademicYear     AcademicYear        @relation("ToYear", fields: [toAcademicYearId], references: [id])
  toAcademicYearId   Int
  initiatedBy        User                @relation(fields: [initiatedById], references: [id])
  initiatedById      Int
  status             PromotionRunStatus  @default(draft)
  createdAt          DateTime            @default(now())
  confirmedAt        DateTime?

  mappings   PromotionMapping[]
  logEntries PromotionLogEntry[]
}

model PromotionMapping {
  id             Int          @id @default(autoincrement())
  promotionRun   PromotionRun @relation(fields: [promotionRunId], references: [id])
  promotionRunId Int
  fromClass      Class        @relation("MappingFrom", fields: [fromClassId], references: [id])
  fromClassId    Int
  toClass        Class?       @relation("MappingTo", fields: [toClassId], references: [id])
  toClassId      Int?

  @@unique([promotionRunId, fromClassId])
}

model PromotionLogEntry {
  id             Int              @id @default(autoincrement())
  promotionRun   PromotionRun     @relation(fields: [promotionRunId], references: [id])
  promotionRunId Int
  student        Student          @relation(fields: [studentId], references: [id])
  studentId      Int
  fromClassId    Int
  toClassId      Int?
  action         EnrollmentStatus

  @@unique([promotionRunId, studentId])
}
```

- [ ] Run the migration:

```bash
cd apps/web && npx prisma migrate dev --name academic_year_and_enrollment
```

Expected: Prisma reports data loss on `Student.classId`/`Student.section` (fine, no real data exists) and creates the migration successfully. Then regenerate the client if it didn't happen automatically: `npx prisma generate`.

- [ ] Commit:

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations
git commit -m "Add AcademicYear, Enrollment, and PromotionRun models"
```

### Step 2: Shared helpers — `academic-years.ts` and `enrollment.ts`

- [ ] Create `apps/web/src/lib/academic-years.ts`:

```ts
import type { PrismaClient, AcademicYear } from "@prisma/client";

export async function getActiveAcademicYear(
  prisma: PrismaClient,
  schoolId: number
): Promise<AcademicYear | null> {
  return prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });
}

export type ResolveAcademicYearResult =
  | { ok: true; academicYear: AcademicYear }
  | { ok: false; error: "INVALID_ACADEMIC_YEAR" };

export async function resolveAcademicYear(
  prisma: PrismaClient,
  schoolId: number,
  requestedId?: number
): Promise<ResolveAcademicYearResult> {
  const academicYear = requestedId
    ? await prisma.academicYear.findFirst({ where: { id: requestedId, schoolId } })
    : await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });

  if (!academicYear) {
    return { ok: false, error: "INVALID_ACADEMIC_YEAR" };
  }
  return { ok: true, academicYear };
}
```

- [ ] Create `apps/web/src/lib/enrollment.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export interface EnrolledStudent {
  id: number;
  name: string;
}

export async function getEnrolledStudents(
  prisma: PrismaClient,
  params: { classId: number; academicYearId: number }
): Promise<EnrolledStudent[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId, status: "active" },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });
  return enrollments.map((enrollment) => ({
    id: enrollment.student.id,
    name: enrollment.student.name,
  }));
}
```

- [ ] Commit:

```bash
git add apps/web/src/lib/academic-years.ts apps/web/src/lib/enrollment.ts
git commit -m "Add academic-year resolution and enrollment lookup helpers"
```

### Step 3: Test helper, fixtures, seed, and resetDb

- [ ] Create `apps/web/tests/helpers/enrollment.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export async function createActiveYear(prisma: PrismaClient, schoolId: number, name = "2026-27") {
  return prisma.academicYear.create({
    data: {
      schoolId,
      name,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-04-30"),
      status: "active",
    },
  });
}

export async function createEnrolledStudent(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    classId: number;
    academicYearId: number;
    name: string;
    dob: Date;
    admissionNo: string;
  }
) {
  const student = await prisma.student.create({
    data: {
      schoolId: params.schoolId,
      name: params.name,
      dob: params.dob,
      admissionNo: params.admissionNo,
    },
  });
  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      classId: params.classId,
      academicYearId: params.academicYearId,
      status: "active",
    },
  });
  return student;
}
```

- [ ] Replace `apps/web/tests/helpers/db.ts` with:

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function resetDb(): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.feePayment.deleteMany();
  await prisma.feeStructure.deleteMany();
  await prisma.mark.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.assignmentStatus.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.timetableEntry.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.classTeacher.deleteMany();
  await prisma.parentStudent.deleteMany();
  await prisma.promotionLogEntry.deleteMany();
  await prisma.promotionMapping.deleteMany();
  await prisma.promotionRun.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();
}
```

- [ ] Replace `apps/web/prisma/fixtures.ts` with:

```ts
import type { PrismaClient } from "@prisma/client";

export async function createSeedFixtures(prisma: PrismaClient) {
  const school = await prisma.school.create({ data: { name: "Greenwood High" } });

  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: "2026-27",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-04-30"),
      status: "active",
    },
  });

  const classA = await prisma.class.create({
    data: { schoolId: school.id, name: "Grade 5", section: "A" },
  });

  const teacher = await prisma.user.create({
    data: { phone: "+10000000001", role: "teacher", name: "Anitha Rao", schoolId: school.id },
  });

  const admin = await prisma.user.create({
    data: { phone: "+10000000002", role: "admin", name: "Rajesh Kumar", schoolId: school.id },
  });

  const accountant = await prisma.user.create({
    data: { phone: "+10000000003", role: "accountant", name: "Meena Iyer", schoolId: school.id },
  });

  const parent = await prisma.user.create({
    data: { phone: "+10000000004", role: "parent", name: "Priya Sharma", schoolId: school.id },
  });

  const student = await prisma.student.create({
    data: {
      schoolId: school.id,
      name: "Rohan Sharma",
      dob: new Date("2015-04-12"),
      admissionNo: "GH-2026-001",
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      classId: classA.id,
      academicYearId: academicYear.id,
      status: "active",
    },
  });

  await prisma.parentStudent.create({
    data: { parentUserId: parent.id, studentId: student.id },
  });

  await prisma.classTeacher.create({
    data: {
      classId: classA.id,
      teacherUserId: teacher.id,
      subject: "Mathematics",
      academicYearId: academicYear.id,
    },
  });

  return { school, academicYear, classA, teacher, admin, accountant, parent, student };
}
```

`prisma/seed.ts` is unchanged (it already just calls `createSeedFixtures` and logs `school.name`/`student.name`).

- [ ] Run the seed to confirm it still works end-to-end: `cd apps/web && npm run seed`. Expected: `Seed complete: { school: 'Greenwood High', student: 'Rohan Sharma' }`.

- [ ] Commit:

```bash
git add apps/web/prisma/fixtures.ts apps/web/tests/helpers
git commit -m "Update fixtures and test helpers for AcademicYear/Enrollment"
```

### Step 4: Retrofit Attendance

- [ ] Replace `apps/web/src/lib/attendance.ts` with:

```ts
import type { PrismaClient, AttendanceStatus } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { getEnrolledStudents } from "./enrollment";

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

  const result: RosterEntry[] = enrolled.map((student) => {
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
    academicYearId: number;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "present" | "absent" | "late"; note?: string }>;
  }
): Promise<MarkAttendanceResult> {
  const assignment = await prisma.classTeacher.findFirst({
    where: {
      classId: params.classId,
      teacherUserId: params.teacherUserId,
      academicYearId: params.academicYearId,
    },
  });
  if (!assignment) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const enrolledCount = await prisma.enrollment.count({
    where: {
      classId: params.classId,
      academicYearId: params.academicYearId,
      status: "active",
      studentId: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (enrolledCount !== params.entries.length) {
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
```

- [ ] Replace `apps/web/src/app/api/attendance/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getAttendanceRoster, markAttendance } from "@/lib/attendance";
import { resolveAcademicYear } from "@/lib/academic-years";

export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);

    const { searchParams } = new URL(request.url);
    const classIdParam = searchParams.get("classId");
    const date = searchParams.get("date");
    if (!classIdParam || !date) {
      return NextResponse.json({ error: "classId and date are required" }, { status: 400 });
    }
    const classId = Number(classIdParam);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "classId and date are required" }, { status: 400 });
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await getAttendanceRoster(prisma, {
      classId,
      date,
      schoolId: claims.schoolId,
      academicYearId: yearResult.academicYear.id,
      role: claims.role,
      userId: claims.userId,
    });

    if (!result.ok) {
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
    }

    return NextResponse.json({ students: result.students });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["teacher"]);

    let classId: number | undefined;
    let date: string | undefined;
    let entries: Array<{ studentId: number; status: "present" | "absent" | "late"; note?: string }> | undefined;
    try {
      ({ classId, date, entries } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || !date || !entries || entries.length === 0) {
      return NextResponse.json(
        { error: "classId, date, and entries are required" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }
    if (yearResult.academicYear.status !== "active") {
      return NextResponse.json(
        { error: "This academic year is archived and no longer accepts changes" },
        { status: 400 }
      );
    }

    const result = await markAttendance(prisma, {
      classId,
      date,
      academicYearId: yearResult.academicYear.id,
      teacherUserId: claims.userId,
      entries,
    });

    if (!result.ok) {
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      return NextResponse.json(
        { error: "One or more students do not belong to this class" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Update `apps/web/tests/attendance-api.test.ts`: both `seedSchoolWithClassAndTeacher` helpers (one per `describe` block — the file has one shared shape used twice) need the same two edits. Apply this edit to **each occurrence** in the file (use `replace_all` since both blocks are byte-identical):

Old:
```ts
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getAttendance, POST as postAttendance } from "../src/app/api/attendance/route";
```

New:
```ts
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createEnrolledStudent } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getAttendance, POST as postAttendance } from "../src/app/api/attendance/route";
```

Old (appears once, inside the single `seedSchoolWithClassAndTeacher` helper):
```ts
  async function seedSchoolWithClassAndTeacher() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550001111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math" },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Test Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-500",
      },
    });
    return { school, klass, teacher, student };
  }
```

New:
```ts
  async function seedSchoolWithClassAndTeacher() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550001111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math", academicYearId: year.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-500",
    });
    return { school, year, klass, teacher, student };
  }
```

- [ ] Also update the one inline `otherStudent` creation (`"rejects a studentId that doesn't belong to the class with 400"` test) from:

```ts
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Other Student",
        dob: new Date("2015-01-01"),
        classId: otherClass.id,
        section: "B",
        admissionNo: "SCH-501",
      },
    });
```

to:

```ts
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: otherClass.id,
      academicYearId: (await seedSchoolWithClassAndTeacher()).year.id,
      name: "Other Student",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-501",
    });
```

Wait — that would re-seed a second school. Instead, thread the existing `year` through: since the test already destructures `const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();` at the top, change that destructure to `const { school, klass, teacher, year } = await seedSchoolWithClassAndTeacher();` and use `academicYearId: year.id` directly in the `createEnrolledStudent` call above.

- [ ] Run just this file: `cd apps/web && npx vitest run tests/attendance-api.test.ts`. Expected: all tests pass.

- [ ] Commit:

```bash
git add apps/web/src/lib/attendance.ts apps/web/src/app/api/attendance/route.ts apps/web/tests/attendance-api.test.ts
git commit -m "Retrofit Attendance for AcademicYear/Enrollment"
```

### Step 5: Retrofit Marks/Exams

- [ ] In `apps/web/src/lib/exams.ts`, add `academicYearId` to both functions:

```ts
import type { PrismaClient } from "@prisma/client";

export interface ExamSummary {
  id: number;
  name: string;
  term: string;
  examDate: string;
}

export async function listExams(prisma: PrismaClient, schoolId: number): Promise<ExamSummary[]> {
  const exams = await prisma.exam.findMany({
    where: { schoolId },
    orderBy: { examDate: "desc" },
  });
  return exams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    term: exam.term,
    examDate: exam.examDate.toISOString().slice(0, 10),
  }));
}

export async function createExam(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: { name: string; term: string; examDate: string }
): Promise<{ id: number }> {
  const created = await prisma.exam.create({
    data: {
      schoolId,
      academicYearId,
      name: input.name,
      term: input.term,
      examDate: new Date(input.examDate),
    },
  });
  return { id: created.id };
}
```

(`listExams` intentionally keeps listing across all years — Marks history browsing across a student's academic journey needs this; only `createExam` is year-scoped since new exams always belong to the active year.)

- [ ] In `apps/web/src/app/api/exams/route.ts`, update the `POST` handler to resolve and pass the active year:

```ts
import { resolveAcademicYear } from "@/lib/academic-years";
// ...
export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let name: string | undefined;
    let term: string | undefined;
    let examDate: string | undefined;
    try {
      ({ name, term, examDate } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !term || !examDate) {
      return NextResponse.json(
        { error: "name, term, and examDate are required" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok || yearResult.academicYear.status !== "active") {
      return NextResponse.json(
        { error: "No active academic year is configured" },
        { status: 400 }
      );
    }

    const result = await createExam(prisma, claims.schoolId, yearResult.academicYear.id, {
      name,
      term,
      examDate,
    });
    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

(`GET` is unchanged.)

- [ ] In `apps/web/tests/exams-api.test.ts`, every direct `prisma.exam.create({ data: { schoolId, name, term, examDate } })` needs `academicYearId` added. Since exams tests don't need a specific class/student, add a minimal year inline. For each of the four occurrences (`"creates an exam and lists it"` calls `createExam` via the route so no test change needed there; `"allows a teacher to GET the exam list"` and `"only lists exams belonging to the caller's school"` create `Exam` directly), add before the `prisma.exam.create` call:

```ts
    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id, // or otherSchool.id for the cross-school test
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
```

and add `academicYearId: year.id` into the `data` object of that `prisma.exam.create` call. (Use `otherSchool.id` for the year created alongside `otherSchool`'s exam in the `"only lists exams..."` test.)

- [ ] Replace `apps/web/src/lib/marks.ts` with:

```ts
import type { PrismaClient } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { getEnrolledStudents } from "./enrollment";

export interface MarkCell {
  marksObtained: number;
  maxMarks: number;
  grade: string;
}

export interface MarksStudentRow {
  studentId: number;
  name: string;
  marks: Record<string, MarkCell | null>;
}

export type GetMarksResult =
  | { ok: true; subjects: string[]; students: MarksStudentRow[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_EXAM" };

export async function getMarksForClassExam(
  prisma: PrismaClient,
  params: {
    classId: number;
    examId: number;
    schoolId: number;
    academicYearId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<GetMarksResult> {
  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: {
        classId: params.classId,
        teacherUserId: params.userId,
        academicYearId: params.academicYearId,
      },
    });
    if (!link) {
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

  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId },
  });
  if (!exam) {
    return { ok: false, error: "INVALID_EXAM" };
  }

  const enrolled = await getEnrolledStudents(prisma, {
    classId: params.classId,
    academicYearId: params.academicYearId,
  });

  const marks = await prisma.mark.findMany({
    where: { examId: params.examId, studentId: { in: enrolled.map((s) => s.id) } },
  });

  const subjects = Array.from(new Set(marks.map((mark) => mark.subject))).sort();

  const studentRows: MarksStudentRow[] = enrolled.map((student) => {
    const marksBySubject: Record<string, MarkCell | null> = {};
    for (const subject of subjects) {
      const mark = marks.find((m) => m.studentId === student.id && m.subject === subject);
      marksBySubject[subject] = mark
        ? { marksObtained: mark.marksObtained, maxMarks: mark.maxMarks, grade: mark.grade }
        : null;
    }
    return { studentId: student.id, name: student.name, marks: marksBySubject };
  });

  return { ok: true, subjects, students: studentRows };
}

export function computeGrade(marksObtained: number, maxMarks: number): string {
  const percentage = (marksObtained / maxMarks) * 100;
  if (percentage >= 90) return "A";
  if (percentage >= 75) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

export type EnterMarksResult =
  | { ok: true }
  | { ok: false; error: "INVALID_EXAM" }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "STUDENT_MISMATCH" }
  | { ok: false; error: "INVALID_MAX_MARKS" }
  | { ok: false; error: "INVALID_MARKS_RANGE" };

export async function enterMarks(
  prisma: PrismaClient,
  params: {
    classId: number;
    examId: number;
    subject: string;
    maxMarks: number;
    teacherUserId: number;
    schoolId: number;
    academicYearId: number;
    entries: Array<{ studentId: number; marksObtained: number }>;
  }
): Promise<EnterMarksResult> {
  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId },
  });
  if (!exam) {
    return { ok: false, error: "INVALID_EXAM" };
  }

  const link = await prisma.classTeacher.findFirst({
    where: {
      classId: params.classId,
      subject: params.subject,
      teacherUserId: params.teacherUserId,
      academicYearId: params.academicYearId,
    },
  });
  if (!link) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const enrolledCount = await prisma.enrollment.count({
    where: {
      classId: params.classId,
      academicYearId: params.academicYearId,
      status: "active",
      studentId: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (enrolledCount !== params.entries.length) {
    return { ok: false, error: "STUDENT_MISMATCH" };
  }

  if (params.maxMarks <= 0) {
    return { ok: false, error: "INVALID_MAX_MARKS" };
  }

  for (const entry of params.entries) {
    if (entry.marksObtained < 0 || entry.marksObtained > params.maxMarks) {
      return { ok: false, error: "INVALID_MARKS_RANGE" };
    }
  }

  await prisma.$transaction(
    params.entries.map((entry) =>
      prisma.mark.upsert({
        where: {
          examId_studentId_subject: {
            examId: params.examId,
            studentId: entry.studentId,
            subject: params.subject,
          },
        },
        create: {
          examId: params.examId,
          studentId: entry.studentId,
          subject: params.subject,
          marksObtained: entry.marksObtained,
          maxMarks: params.maxMarks,
          grade: computeGrade(entry.marksObtained, params.maxMarks),
        },
        update: {
          marksObtained: entry.marksObtained,
          maxMarks: params.maxMarks,
          grade: computeGrade(entry.marksObtained, params.maxMarks),
        },
      })
    )
  );

  return { ok: true };
}
```

- [ ] In `apps/web/src/app/api/marks/route.ts`, both `GET` and `POST` need a resolved academic year threaded in. Add `import { resolveAcademicYear } from "@/lib/academic-years";` at top, and in `GET` before calling `getMarksForClassExam`:

```ts
    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await getMarksForClassExam(prisma, {
      classId,
      examId,
      schoolId: claims.schoolId,
      academicYearId: yearResult.academicYear.id,
      role: claims.role,
      userId: claims.userId,
    });
```

and in `POST` before calling `enterMarks`, the same `yearResult` resolution plus an archived check (`if (yearResult.academicYear.status !== "active") return 400 "This academic year is archived and no longer accepts changes"`), then pass `academicYearId: yearResult.academicYear.id` into the `enterMarks(...)` call alongside the existing fields.

- [ ] In `apps/web/tests/marks-api.test.ts`, apply the same two edits used for Attendance to **all three** `seedSchoolWithClassTeacherAndExam` helpers in the file (the `GET` describe block, the `POST` describe block — both byte-identical) plus the boundary-grade student loop and the `otherStudent`/cross-class student creation:

  - Add `const year = await createActiveYear(prisma, school.id);` right after `const school = ...`.
  - Add `academicYearId: year.id` to the `prisma.classTeacher.create` call.
  - Add `academicYearId: year.id` to the `prisma.exam.create` call.
  - Replace the `prisma.student.create({ data: { schoolId, name, dob, classId, section, admissionNo } })` call with `createEnrolledStudent(prisma, { schoolId: school.id, classId: klass.id, academicYearId: year.id, name, dob, admissionNo })`.
  - Return `year` from the helper, and destructure it at call sites that need it (the boundary-grade loop and the "outside the class" test, both of which create additional students and must pass the same `year.id`).
  - Add `import { createActiveYear, createEnrolledStudent } from "./helpers/enrollment";` next to the existing imports.

- [ ] Run: `cd apps/web && npx vitest run tests/marks-api.test.ts tests/exams-api.test.ts`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/lib/marks.ts apps/web/src/lib/exams.ts apps/web/src/app/api/marks/route.ts apps/web/src/app/api/exams/route.ts apps/web/tests/marks-api.test.ts apps/web/tests/exams-api.test.ts
git commit -m "Retrofit Marks/Exams for AcademicYear/Enrollment"
```

### Step 6: Retrofit Timetable

- [ ] Replace `apps/web/src/lib/timetable.ts` with:

```ts
import type { PrismaClient } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { isUniqueConstraintViolation } from "./school-setup/prisma-errors";

export interface TimetableEntrySummary {
  id: number;
  dayOfWeek: number;
  period: number;
  subject: string;
  teacherUserId: number | null;
  teacherName: string | null;
}

export type ListTimetableResult =
  | { ok: true; entries: TimetableEntrySummary[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function listTimetableEntries(
  prisma: PrismaClient,
  params: {
    classId: number;
    schoolId: number;
    academicYearId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<ListTimetableResult> {
  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: {
        classId: params.classId,
        teacherUserId: params.userId,
        academicYearId: params.academicYearId,
      },
    });
    if (!link) {
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

  const entries = await prisma.timetableEntry.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId },
    include: { teacher: true },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  return {
    ok: true,
    entries: entries.map((entry) => ({
      id: entry.id,
      dayOfWeek: entry.dayOfWeek,
      period: entry.period,
      subject: entry.subject,
      teacherUserId: entry.teacherUserId,
      teacherName: entry.teacher ? entry.teacher.name : null,
    })),
  };
}

export type CreateTimetableEntryResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_DAY" }
  | { ok: false; error: "INVALID_TEACHER" }
  | { ok: false; error: "DUPLICATE_SLOT" };

export async function createTimetableEntry(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    academicYearId: number;
    classId: number;
    dayOfWeek: number;
    period: number;
    subject: string;
    teacherUserId?: number;
  }
): Promise<CreateTimetableEntryResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) {
    return { ok: false, error: "INVALID_CLASS" };
  }

  if (params.dayOfWeek < 1 || params.dayOfWeek > 6) {
    return { ok: false, error: "INVALID_DAY" };
  }

  if (params.teacherUserId !== undefined) {
    const teacher = await prisma.user.findFirst({
      where: { id: params.teacherUserId, schoolId: params.schoolId, role: "teacher" },
    });
    if (!teacher) {
      return { ok: false, error: "INVALID_TEACHER" };
    }
  }

  try {
    const created = await prisma.timetableEntry.create({
      data: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        dayOfWeek: params.dayOfWeek,
        period: params.period,
        subject: params.subject,
        teacherUserId: params.teacherUserId ?? null,
      },
    });
    return { ok: true, id: created.id };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_SLOT" };
    }
    throw err;
  }
}

export type EditTimetableEntryResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_TEACHER" };

export async function editTimetableEntry(
  prisma: PrismaClient,
  params: {
    entryId: number;
    schoolId: number;
    fields: {
      subject?: string;
      teacherUserId?: number | null;
    };
  }
): Promise<EditTimetableEntryResult> {
  const entry = await prisma.timetableEntry.findUnique({
    where: { id: params.entryId },
    include: { class: true },
  });
  if (!entry || entry.class.schoolId !== params.schoolId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const data: { subject?: string; teacherUserId?: number | null } = {};
  if (params.fields.subject !== undefined) {
    data.subject = params.fields.subject;
  }
  if (params.fields.teacherUserId !== undefined) {
    if (params.fields.teacherUserId !== null) {
      const teacher = await prisma.user.findFirst({
        where: { id: params.fields.teacherUserId, schoolId: params.schoolId, role: "teacher" },
      });
      if (!teacher) {
        return { ok: false, error: "INVALID_TEACHER" };
      }
    }
    data.teacherUserId = params.fields.teacherUserId;
  }

  await prisma.timetableEntry.update({ where: { id: params.entryId }, data });
  return { ok: true };
}

export type DeleteTimetableEntryResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function deleteTimetableEntry(
  prisma: PrismaClient,
  params: { entryId: number; schoolId: number }
): Promise<DeleteTimetableEntryResult> {
  const entry = await prisma.timetableEntry.findUnique({
    where: { id: params.entryId },
    include: { class: true },
  });
  if (!entry || entry.class.schoolId !== params.schoolId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  await prisma.timetableEntry.delete({ where: { id: params.entryId } });
  return { ok: true };
}
```

(`editTimetableEntry`/`deleteTimetableEntry` operate on an existing entry by id, so they don't need `academicYearId` — the entry already carries it.)

- [ ] In `apps/web/src/app/api/timetable/route.ts`, add `import { resolveAcademicYear } from "@/lib/academic-years";`, resolve the year in both `GET` and `POST` the same way as Attendance/Marks (in `GET`, pass `academicYearId: yearResult.academicYear.id` into `listTimetableEntries`; in `POST`, add the archived-year 400 check and pass `academicYearId: yearResult.academicYear.id` into `createTimetableEntry`). `apps/web/src/app/api/timetable/[id]/route.ts` is unchanged (edit/delete work off the entry's own id).

- [ ] In `apps/web/tests/timetable-api.test.ts`, update both `seedSchoolWithClassAndTeacher` (in the first `describe`) and `seedEntry` (in the second `describe`):
  - Add `import { createActiveYear } from "./helpers/enrollment";`.
  - In `seedSchoolWithClassAndTeacher`: add `const year = await createActiveYear(prisma, school.id);` after `school` is created, add `academicYearId: year.id` to the `classTeacher.create` call, return `year`.
  - In `seedEntry`: add `const year = await createActiveYear(prisma, school.id);`, add `academicYearId: year.id` to the `timetableEntry.create` call, return `year`.
  - Every direct `prisma.timetableEntry.create(...)` call elsewhere in the file (the "lists entries sorted by day then period" test) needs `academicYearId: year.id` added too — thread `year` through that test's destructure.

- [ ] Run: `cd apps/web && npx vitest run tests/timetable-api.test.ts`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/lib/timetable.ts apps/web/src/app/api/timetable apps/web/tests/timetable-api.test.ts
git commit -m "Retrofit Timetable for AcademicYear/Enrollment"
```

### Step 7: Retrofit Assignments

- [ ] Replace `apps/web/src/lib/assignments.ts` with (only the parts that change from the current file — `isOverdue`, `displayStatus`, `computeGrade`-style helpers and `editAssignment`/`getAssignmentStatuses` bodies stay as-is except where noted):

```ts
import type { PrismaClient, AssignmentStatusValue } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";
import { getEnrolledStudents } from "./enrollment";

function isOverdue(dueDate: Date): boolean {
  const todayStart = new Date(new Date().toISOString().slice(0, 10));
  return dueDate < todayStart;
}

function displayStatus(
  status: AssignmentStatusValue,
  dueDate: Date
): "pending" | "submitted" | "overdue" {
  if (status === "pending" && isOverdue(dueDate)) {
    return "overdue";
  }
  return status;
}

export interface AssignmentSummary {
  id: number;
  subject: string;
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
    if (!link) {
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

  const assignments = await prisma.assignment.findMany({
    where: { classId: params.classId },
    include: { statuses: true },
    orderBy: { dueDate: "desc" },
  });

  const result: AssignmentSummary[] = assignments.map((assignment) => {
    const submittedCount = assignment.statuses.filter((s) => s.status === "submitted").length;
    const hasOverdue = assignment.statuses.some(
      (s) => s.status === "pending" && isOverdue(assignment.dueDate)
    );
    return {
      id: assignment.id,
      subject: assignment.subject,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate.toISOString().slice(0, 10),
      createdById: assignment.createdById,
      submittedCount,
      totalCount: assignment.statuses.length,
      hasOverdue,
    };
  });

  return { ok: true, assignments: result };
}

export type CreateAssignmentResult = { ok: true; id: number } | { ok: false; error: "NOT_ASSIGNED" };

export async function createAssignment(
  prisma: PrismaClient,
  params: {
    classId: number;
    teacherUserId: number;
    subject: string;
    title: string;
    description?: string;
    dueDate: string;
    academicYearId: number;
  }
): Promise<CreateAssignmentResult> {
  const link = await prisma.classTeacher.findFirst({
    where: {
      classId: params.classId,
      teacherUserId: params.teacherUserId,
      academicYearId: params.academicYearId,
    },
  });
  if (!link) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: {
        classId: params.classId,
        subject: params.subject,
        title: params.title,
        description: params.description ?? null,
        dueDate: new Date(params.dueDate),
        createdById: params.teacherUserId,
        academicYearId: params.academicYearId,
      },
    });

    const enrolled = await getEnrolledStudents(prisma, {
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
    }
    return created;
  });

  return { ok: true, id: assignment.id };
}
```

`editAssignment` is unchanged. In `getAssignmentStatuses` and `updateAssignmentStatuses`, the only change is the `STUDENT_MISMATCH`/roster check: replace every `prisma.student.count({ where: { classId: assignment.classId, id: { in: ... } } })` with `prisma.enrollment.count({ where: { classId: assignment.classId, academicYearId: assignment.academicYearId, status: "active", studentId: { in: ... } } })`, and thread `academicYearId: number` into `updateAssignmentStatuses`'s params only if needed — since `assignment.academicYearId` is already available from the `assignment` row fetched at the top of that function, no new param is required there. Keep the rest of both functions (including `getAssignmentStatuses`'s ordering by `student.name`) identical to the current file.

- [ ] In `apps/web/src/app/api/assignments/route.ts`, add `import { resolveAcademicYear } from "@/lib/academic-years";`; in `GET`, resolve the year and pass `academicYearId: yearResult.academicYear.id` into `listAssignments`; in `POST`, resolve the year, add the archived-year 400 check, and pass `academicYearId: yearResult.academicYear.id` into `createAssignment`. `[id]/route.ts` and `[id]/statuses/route.ts` are unchanged (they operate off an existing assignment id, whose `academicYearId` is already fixed).

- [ ] In `apps/web/tests/assignments-api.test.ts`, apply the enrollment-helper pattern to all three seed helpers (`seedSchoolWithClassAndTeacher`, `seedAssignment`, `seedAssignmentWithStudents`) and their inline student/assignment creations, exactly as done for Attendance/Marks/Timetable:
  - `import { createActiveYear, createEnrolledStudent } from "./helpers/enrollment";`
  - Each helper creates `const year = await createActiveYear(prisma, school.id);`, adds `academicYearId: year.id` to every `classTeacher.create` and `assignment.create` call, replaces every `prisma.student.create({ data: {..., classId, section, ...} })` with `createEnrolledStudent(prisma, { schoolId: school.id, classId: klass.id, academicYearId: year.id, name, dob, admissionNo })`, and returns `year`.
  - The inline `otherTeacher`+`classTeacher.create` in `"rejects a different teacher assigned to the same class with 403"` also needs `academicYearId: year.id` (destructure `year` from `seedAssignment()`'s return).

- [ ] Run: `cd apps/web && npx vitest run tests/assignments-api.test.ts`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/lib/assignments.ts apps/web/src/app/api/assignments/route.ts apps/web/tests/assignments-api.test.ts
git commit -m "Retrofit Assignments for AcademicYear/Enrollment"
```

### Step 8: Retrofit Fees

- [ ] Replace `apps/web/src/lib/fee-structures.ts` with:

```ts
import type { PrismaClient } from "@prisma/client";

export interface FeeStructureSummary {
  id: number;
  term: string;
  amount: number;
  dueDate: string;
}

export type ListFeeStructuresResult =
  | { ok: true; feeStructures: FeeStructureSummary[] }
  | { ok: false; error: "INVALID_CLASS" };

export async function listFeeStructures(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number }
): Promise<ListFeeStructuresResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) {
    return { ok: false, error: "INVALID_CLASS" };
  }

  const feeStructures = await prisma.feeStructure.findMany({
    where: { classId: params.classId },
    orderBy: { dueDate: "desc" },
  });

  return {
    ok: true,
    feeStructures: feeStructures.map((fs) => ({
      id: fs.id,
      term: fs.term,
      amount: fs.amount,
      dueDate: fs.dueDate.toISOString().slice(0, 10),
    })),
  };
}

export type CreateFeeStructureResult = { ok: true; id: number } | { ok: false; error: "INVALID_CLASS" };

export async function createFeeStructure(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: { classId: number; term: string; amount: number; dueDate: string }
): Promise<CreateFeeStructureResult> {
  const klass = await prisma.class.findFirst({
    where: { id: input.classId, schoolId },
  });
  if (!klass) {
    return { ok: false, error: "INVALID_CLASS" };
  }

  const created = await prisma.feeStructure.create({
    data: {
      schoolId,
      academicYearId,
      classId: input.classId,
      term: input.term,
      amount: input.amount,
      dueDate: new Date(input.dueDate),
    },
  });
  return { ok: true, id: created.id };
}
```

(`listFeeStructures` intentionally spans all years, same reasoning as `listExams`.)

- [ ] In `apps/web/src/app/api/fee-structures/route.ts`, add `import { resolveAcademicYear } from "@/lib/academic-years";` and in `POST`, before calling `createFeeStructure`:

```ts
    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok || yearResult.academicYear.status !== "active") {
      return NextResponse.json(
        { error: "No active academic year is configured" },
        { status: 400 }
      );
    }

    const result = await createFeeStructure(prisma, claims.schoolId, yearResult.academicYear.id, {
      classId,
      term,
      amount,
      dueDate,
    });
```

`GET` is unchanged.

- [ ] Replace the roster/payment logic in `apps/web/src/lib/fee-payments.ts` — only `getFeeRoster`'s student lookup and `recordPayment`'s student-membership check change, both need `getEnrolledStudents`:

```ts
import type { PrismaClient, FeeStatus } from "@prisma/client";
import { getEnrolledStudents } from "./enrollment";

export interface FeeRosterEntry {
  studentId: number;
  name: string;
  amountPaid: number;
  amount: number;
  status: FeeStatus;
}

export type GetFeeRosterResult =
  | { ok: true; students: FeeRosterEntry[] }
  | { ok: false; error: "INVALID_FEE_STRUCTURE" };

export async function getFeeRoster(
  prisma: PrismaClient,
  params: { feeStructureId: number; schoolId: number }
): Promise<GetFeeRosterResult> {
  const feeStructure = await prisma.feeStructure.findFirst({
    where: { id: params.feeStructureId, schoolId: params.schoolId },
  });
  if (!feeStructure) {
    return { ok: false, error: "INVALID_FEE_STRUCTURE" };
  }

  const enrolled = await getEnrolledStudents(prisma, {
    classId: feeStructure.classId,
    academicYearId: feeStructure.academicYearId,
  });

  const payments = await prisma.feePayment.findMany({
    where: {
      feeStructureId: params.feeStructureId,
      studentId: { in: enrolled.map((student) => student.id) },
    },
  });

  const result: FeeRosterEntry[] = enrolled.map((student) => {
    const payment = payments.find((p) => p.studentId === student.id);
    return {
      studentId: student.id,
      name: student.name,
      amountPaid: payment ? payment.amountPaid : 0,
      amount: feeStructure.amount,
      status: payment ? payment.status : "unpaid",
    };
  });

  return { ok: true, students: result };
}

export function computeFeeStatus(amountPaid: number, amount: number): FeeStatus {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid < amount) return "partial";
  return "paid";
}

export type RecordPaymentResult =
  | { ok: true; amountPaid: number; status: FeeStatus }
  | { ok: false; error: "INVALID_FEE_STRUCTURE" }
  | { ok: false; error: "STUDENT_MISMATCH" }
  | { ok: false; error: "INVALID_AMOUNT" }
  | { ok: false; error: "EXCEEDS_AMOUNT_DUE" };

export async function recordPayment(
  prisma: PrismaClient,
  params: {
    feeStructureId: number;
    studentId: number;
    schoolId: number;
    recordedById: number;
    amount: number;
  }
): Promise<RecordPaymentResult> {
  const feeStructure = await prisma.feeStructure.findFirst({
    where: { id: params.feeStructureId, schoolId: params.schoolId },
  });
  if (!feeStructure) {
    return { ok: false, error: "INVALID_FEE_STRUCTURE" };
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: params.studentId,
      classId: feeStructure.classId,
      academicYearId: feeStructure.academicYearId,
      status: "active",
    },
  });
  if (!enrollment) {
    return { ok: false, error: "STUDENT_MISMATCH" };
  }

  if (params.amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  const existing = await prisma.feePayment.findUnique({
    where: {
      studentId_feeStructureId: {
        studentId: params.studentId,
        feeStructureId: params.feeStructureId,
      },
    },
  });
  const existingAmountPaid = existing ? existing.amountPaid : 0;
  const newAmountPaid = existingAmountPaid + params.amount;

  if (newAmountPaid > feeStructure.amount) {
    return { ok: false, error: "EXCEEDS_AMOUNT_DUE" };
  }

  const status = computeFeeStatus(newAmountPaid, feeStructure.amount);

  await prisma.feePayment.upsert({
    where: {
      studentId_feeStructureId: {
        studentId: params.studentId,
        feeStructureId: params.feeStructureId,
      },
    },
    create: {
      studentId: params.studentId,
      feeStructureId: params.feeStructureId,
      amountPaid: newAmountPaid,
      paidDate: new Date(),
      recordedById: params.recordedById,
      status,
    },
    update: {
      amountPaid: newAmountPaid,
      paidDate: new Date(),
      recordedById: params.recordedById,
      status,
    },
  });

  return { ok: true, amountPaid: newAmountPaid, status };
}
```

`apps/web/src/app/api/fee-payments/route.ts` is unchanged — `feeStructureId` already implies the year via `feeStructure.academicYearId`.

- [ ] In `apps/web/tests/fee-structures-api.test.ts` and `apps/web/tests/fee-payments-api.test.ts`, every `seedSchoolWithFeeStructure` helper needs:
  - `import { createActiveYear, createEnrolledStudent } from "./helpers/enrollment";`
  - `const year = await createActiveYear(prisma, school.id);` after `school` is created.
  - `academicYearId: year.id` added to the `prisma.feeStructure.create` call.
  - The `prisma.student.create({ data: {..., classId, section, ...} })` call replaced with `createEnrolledStudent(prisma, { schoolId: school.id, classId: klass.id, academicYearId: year.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-9xx" })`.
  - Return `year` from the helper.
  - The cross-school `otherFeeStructure` seeded in the "rejects a feeStructureId from a different school" tests (in both files) needs its own `const otherYear = await createActiveYear(prisma, otherSchool.id);` and `academicYearId: otherYear.id`.
  - `fee-payments-api.test.ts`'s "rejects a studentId that doesn't belong to the fee structure's class" test creates `otherClass`/`otherStudent` directly with `prisma.student.create({ ..., classId: otherClass.id, ... })` — replace with `createEnrolledStudent(prisma, { schoolId: school.id, classId: otherClass.id, academicYearId: year.id, name: "Other Student", dob: new Date("2015-01-01"), admissionNo: "SCH-902" })` (same `year`, different `classId` — this is exactly the "enrolled in a different class this year" case the `STUDENT_MISMATCH` check must catch).

- [ ] Run: `cd apps/web && npx vitest run tests/fee-structures-api.test.ts tests/fee-payments-api.test.ts`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/lib/fee-structures.ts apps/web/src/lib/fee-payments.ts apps/web/src/app/api/fee-structures/route.ts apps/web/tests/fee-structures-api.test.ts apps/web/tests/fee-payments-api.test.ts
git commit -m "Retrofit Fees for AcademicYear/Enrollment"
```

### Step 9: Retrofit Students/Staff admin and scoped-queries; close out Task 1

- [ ] Replace `apps/web/src/lib/school-setup/students.ts` with:

```ts
import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}

export async function listStudents(prisma: PrismaClient, schoolId: number): Promise<StudentSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });

  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      parentLinks: { include: { parent: true } },
      enrollments: {
        where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
        include: { class: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return students.map((student) => {
    const enrollment = student.enrollments[0];
    return {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      class: enrollment ? { name: enrollment.class.name, section: enrollment.class.section } : null,
      parents: student.parentLinks.map((link) => ({
        name: link.parent.name,
        phone: link.parent.phone,
      })),
    };
  });
}

export type CreateStudentResult =
  | { ok: true; student: { id: number; name: string; admissionNo: string } }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PARENT_NAME_REQUIRED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function createStudent(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    parentPhone: string;
    parentName?: string;
  }
): Promise<CreateStudentResult> {
  const existingAdmission = await prisma.student.findUnique({
    where: { admissionNo: input.admissionNo },
  });
  if (existingAdmission) {
    return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
  }

  const existingParent = await prisma.user.findUnique({ where: { phone: input.parentPhone } });
  if (existingParent && existingParent.role !== "parent") {
    return { ok: false, error: "PHONE_WRONG_ROLE" };
  }
  if (!existingParent && !input.parentName) {
    return { ok: false, error: "PARENT_NAME_REQUIRED" };
  }

  const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
  if (!targetClass) {
    return { ok: false, error: "INVALID_CLASS" };
  }

  try {
    const student = await prisma.$transaction(async (tx) => {
      const parent =
        existingParent ??
        (await tx.user.create({
          data: { schoolId, phone: input.parentPhone, name: input.parentName as string, role: "parent" },
        }));

      const createdStudent = await tx.student.create({
        data: {
          schoolId,
          name: input.name,
          dob: new Date(input.dob),
          admissionNo: input.admissionNo,
        },
      });

      await tx.enrollment.create({
        data: {
          studentId: createdStudent.id,
          classId: input.classId,
          academicYearId,
          status: "active",
        },
      });

      await tx.parentStudent.create({
        data: { parentUserId: parent.id, studentId: createdStudent.id },
      });

      return createdStudent;
    });

    return {
      ok: true,
      student: { id: student.id, name: student.name, admissionNo: student.admissionNo },
    };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    }
    throw err;
  }
}
```

- [ ] In `apps/web/src/app/api/students/route.ts`, add `import { resolveAcademicYear } from "@/lib/academic-years";` and in `POST`, resolve the active year before calling `createStudent`, returning 400 `"No active academic year is configured"` if `!yearResult.ok`, then call `createStudent(prisma, claims.schoolId, yearResult.academicYear.id, { name, dob, classId, admissionNo, parentPhone, parentName })`.

- [ ] In `apps/web/src/lib/school-setup/staff.ts`, update `listStaff` and `createStaff`:

```ts
import type { PrismaClient, Role } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface StaffSummary {
  id: number;
  name: string;
  phone: string;
  role: Role;
  classAssignment: { className: string; section: string; subject: string } | null;
}

export async function listStaff(prisma: PrismaClient, schoolId: number): Promise<StaffSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });

  const users = await prisma.user.findMany({
    where: { schoolId, role: { in: ["teacher", "admin", "accountant"] } },
    include: {
      classesTaught: {
        where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
        include: { class: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return users.map((user) => {
    const assignment = user.classesTaught[0];
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      classAssignment: assignment
        ? {
            className: assignment.class.name,
            section: assignment.class.section,
            subject: assignment.subject,
          }
        : null,
    };
  });
}

export type CreateStaffResult =
  | { ok: true; staff: { id: number; name: string; phone: string; role: Role } }
  | { ok: false; error: "DUPLICATE_PHONE" }
  | { ok: false; error: "INVALID_CLASS" };

export async function createStaff(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: { name: string; phone: string; role: Role; classId?: number; subject?: string }
): Promise<CreateStaffResult> {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    return { ok: false, error: "DUPLICATE_PHONE" };
  }

  if (input.role === "teacher" && input.classId) {
    const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
    if (!targetClass) {
      return { ok: false, error: "INVALID_CLASS" };
    }
  }

  try {
    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { schoolId, name: input.name, phone: input.phone, role: input.role },
      });

      if (input.role === "teacher" && input.classId && input.subject) {
        await tx.classTeacher.create({
          data: {
            classId: input.classId,
            teacherUserId: created.id,
            subject: input.subject,
            academicYearId,
          },
        });
      }

      return created;
    });

    return {
      ok: true,
      staff: { id: staff.id, name: staff.name, phone: staff.phone, role: staff.role },
    };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_PHONE" };
    }
    throw err;
  }
}
```

- [ ] In `apps/web/src/app/api/staff/route.ts`, resolve the active year the same way (400 `"No active academic year is configured"` if missing) and pass it as `createStaff`'s new second-to-last argument. Note: `createStaff`'s call in the route only needs the year when `role === "teacher" && classId` is set, but resolving it unconditionally keeps the code simple and matches every other route's pattern; a non-teacher staff creation with no active year configured would still 400 today, which is an acceptable, honest limitation (a school must have an academic year before adding any staff) — call this out in the PR description, don't silently work around it.

- [ ] In `apps/web/src/lib/data/scoped-queries.ts`, update `getClassesForTeacher` to take an `academicYearId`:

```ts
import type { PrismaClient, Student, Class } from "@prisma/client";

export async function getStudentsForParent(
  prisma: PrismaClient,
  parentUserId: number
): Promise<Student[]> {
  const links = await prisma.parentStudent.findMany({
    where: { parentUserId },
    include: { student: true },
  });
  return links.map((link) => link.student);
}

export async function getClassesForTeacher(
  prisma: PrismaClient,
  teacherUserId: number,
  academicYearId: number
): Promise<Class[]> {
  const links = await prisma.classTeacher.findMany({
    where: { teacherUserId, academicYearId },
    include: { class: true },
    distinct: ["classId"],
  });
  return links.map((link) => link.class);
}
```

- [ ] Update the three callers of `getClassesForTeacher` — `apps/web/src/app/dashboard/marks/page.tsx`, `apps/web/src/app/dashboard/timetable/page.tsx`, `apps/web/src/app/dashboard/assignments/page.tsx` — each currently calls `await getClassesForTeacher(prisma, claims.userId)`. In each file, add `import { getActiveAcademicYear } from "@/lib/academic-years";`, resolve `const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);` once at the top of the component, and change the call to `getClassesForTeacher(prisma, claims.userId, activeYear?.id ?? -1)` (a `-1` sentinel when no active year exists yet simply yields an empty class list, which is the correct "nothing to show" behavior for a school with no academic year configured — no crash).

- [ ] In `apps/web/tests/scoped-queries.test.ts`, update the one call: `getClassesForTeacher(prisma, fixtures.teacher.id, fixtures.academicYear.id)`.

- [ ] Run the full suite:

```bash
cd apps/web && npm test
```

Expected: every test file passes — this closes out Task 1. If anything fails, it's almost certainly a missed `academicYearId`/`classId` edit in a test fixture from Steps 4–9; fix in place before moving on (do not proceed to Task 2 with a red suite).

- [ ] Commit:

```bash
git add apps/web/src/lib/school-setup/students.ts apps/web/src/lib/school-setup/staff.ts apps/web/src/lib/data/scoped-queries.ts apps/web/src/app/api/students/route.ts apps/web/src/app/api/staff/route.ts apps/web/src/app/dashboard/marks/page.tsx apps/web/src/app/dashboard/timetable/page.tsx apps/web/src/app/dashboard/assignments/page.tsx apps/web/tests/scoped-queries.test.ts
git commit -m "Retrofit Students/Staff admin and scoped-queries for AcademicYear/Enrollment; full suite green"
```

---

## Task 2: Academic Year lib, API, and dashboard page

**Files:**
- Modify: `apps/web/src/lib/academic-years.ts`
- Create: `apps/web/src/app/api/academic-years/route.ts`
- Create: `apps/web/src/app/dashboard/academic-years/page.tsx`
- Create: `apps/web/src/components/academic-years/AcademicYearsView.tsx`
- Modify: `apps/web/src/lib/dashboard/nav-items.ts`
- Create: `apps/web/tests/academic-years-api.test.ts`

**Interfaces produced:**
- `listAcademicYears(prisma, schoolId): Promise<AcademicYearSummary[]>`
- `createAcademicYear(prisma, schoolId, input): Promise<CreateAcademicYearResult>`

### Step 1: Extend `academic-years.ts`

- [ ] Add to `apps/web/src/lib/academic-years.ts` (below the existing `getActiveAcademicYear`/`resolveAcademicYear`):

```ts
export interface AcademicYearSummary {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "archived";
}

export async function listAcademicYears(
  prisma: PrismaClient,
  schoolId: number
): Promise<AcademicYearSummary[]> {
  const years = await prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: "desc" },
  });
  return years.map((year) => ({
    id: year.id,
    name: year.name,
    startDate: year.startDate.toISOString().slice(0, 10),
    endDate: year.endDate.toISOString().slice(0, 10),
    status: year.status,
  }));
}

export type CreateAcademicYearResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_DATE_RANGE" }
  | { ok: false; error: "DUPLICATE_NAME" };

export async function createAcademicYear(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string; startDate: string; endDate: string }
): Promise<CreateAcademicYearResult> {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (startDate >= endDate) {
    return { ok: false, error: "INVALID_DATE_RANGE" };
  }

  const existing = await prisma.academicYear.findFirst({
    where: { schoolId, name: input.name },
  });
  if (existing) {
    return { ok: false, error: "DUPLICATE_NAME" };
  }

  const created = await prisma.academicYear.create({
    data: { schoolId, name: input.name, startDate, endDate, status: "upcoming" },
  });
  return { ok: true, id: created.id };
}
```

- [ ] Commit: `git add apps/web/src/lib/academic-years.ts && git commit -m "Add listAcademicYears/createAcademicYear"`

### Step 2: API route and tests

- [ ] Create `apps/web/src/app/api/academic-years/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listAcademicYears, createAcademicYear } from "@/lib/academic-years";

export async function GET() {
  try {
    const claims = requireApiRole(["admin", "teacher", "accountant"]);
    const academicYears = await listAcademicYears(prisma, claims.schoolId);
    return NextResponse.json({ academicYears });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let name: string | undefined;
    let startDate: string | undefined;
    let endDate: string | undefined;
    try {
      ({ name, startDate, endDate } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: "name, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const result = await createAcademicYear(prisma, claims.schoolId, { name, startDate, endDate });

    if (!result.ok) {
      if (result.error === "INVALID_DATE_RANGE") {
        return NextResponse.json({ error: "startDate must be before endDate" }, { status: 400 });
      }
      return NextResponse.json(
        { error: "An academic year with this name already exists" },
        { status: 400 }
      );
    }

    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/tests/academic-years-api.test.ts`:

```ts
import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getAcademicYears, POST as postAcademicYears } from "../src/app/api/academic-years/route";

describe("/api/academic-years", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  function loginAs(userId: number, role: "admin" | "teacher" | "accountant", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates an academic year as upcoming and lists it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550091111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const postRequest = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "2026-27", startDate: "2026-06-01", endDate: "2027-04-30" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postAcademicYears(postRequest);
    expect(postResponse.status).toBe(200);
    const created = await postResponse.json();
    expect(created.id).toBeTypeOf("number");

    const stored = await prisma.academicYear.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe("upcoming");

    const getResponse = await getAcademicYears();
    const body = await getResponse.json();
    expect(body.academicYears).toEqual([
      { id: created.id, name: "2026-27", startDate: "2026-06-01", endDate: "2027-04-30", status: "upcoming" },
    ]);
  });

  it("rejects startDate on or after endDate with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550092222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "Bad Year", startDate: "2027-01-01", endDate: "2026-01-01" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAcademicYears(request);
    expect(response.status).toBe(400);
  });

  it("rejects a duplicate name for the same school with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550093333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "2026-27", startDate: "2026-07-01", endDate: "2027-05-01" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAcademicYears(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing field with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550094444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "2026-27", startDate: "2026-06-01" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAcademicYears(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher attempting to POST with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550095555", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/academic-years", {
      method: "POST",
      body: JSON.stringify({ name: "2026-27", startDate: "2026-06-01", endDate: "2027-04-30" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAcademicYears(request);
    expect(response.status).toBe(403);
  });

  it("allows a teacher to GET the list", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550096666", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const response = await getAcademicYears();
    expect(response.status).toBe(200);
  });

  it("only lists academic years belonging to the caller's school", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    await prisma.academicYear.create({
      data: {
        schoolId: otherSchool.id,
        name: "2025-26",
        startDate: new Date("2025-06-01"),
        endDate: new Date("2026-04-30"),
        status: "archived",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550097777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const response = await getAcademicYears();
    const body = await response.json();
    expect(body.academicYears).toEqual([]);
  });
});
```

- [ ] Run: `cd apps/web && npx vitest run tests/academic-years-api.test.ts`. Expected: all pass.

- [ ] Commit: `git add apps/web/src/app/api/academic-years apps/web/tests/academic-years-api.test.ts && git commit -m "Add Academic Years API"`

### Step 3: Dashboard page

- [ ] Add `/dashboard/academic-years` to `apps/web/src/lib/dashboard/nav-items.ts`: add `{ href: "/dashboard/academic-years", label: "Academic Years" }` to `ALL_NAV_ITEMS`, and add `"/dashboard/academic-years"` to the `admin` array only in `NAV_HREFS_BY_ROLE` (not `teacher`/`accountant`/`parent`).

- [ ] Create `apps/web/src/components/academic-years/AcademicYearsView.tsx`:

```tsx
"use client";

import { useState } from "react";

interface AcademicYearRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "archived";
}

export function AcademicYearsView({ initialYears }: { initialYears: AcademicYearRow[] }) {
  const [years, setYears] = useState(initialYears);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/academic-years");
    const body = await response.json();
    setYears(body.academicYears);
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch("/api/academic-years", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, startDate, endDate }),
    });
    if (response.ok) {
      setName("");
      setStartDate("");
      setEndDate("");
      await refresh();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          aria-label="Name"
          placeholder="2026-27"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
        <input
          type="date"
          aria-label="Start date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
        <input
          type="date"
          aria-label="End date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="rounded bg-blue-600 px-3 py-1 text-white"
        >
          Create Academic Year
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Start</th>
            <th className="border-b border-gray-200 pb-2">End</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year.id}>
              <td className="border-b border-gray-100 py-2">{year.name}</td>
              <td className="border-b border-gray-100 py-2">{year.startDate}</td>
              <td className="border-b border-gray-100 py-2">{year.endDate}</td>
              <td
                className={`border-b border-gray-100 py-2 ${
                  year.status === "active"
                    ? "text-green-600"
                    : year.status === "upcoming"
                      ? "text-amber-600"
                      : "text-gray-500"
                }`}
              >
                {year.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] Create `apps/web/src/app/dashboard/academic-years/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { AcademicYearsView } from "@/components/academic-years/AcademicYearsView";

export default async function AcademicYearsPage() {
  const claims = requireDashboardRole(["admin"]);
  const years = await listAcademicYears(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Academic Years</h1>
      <AcademicYearsView initialYears={years} />
    </div>
  );
}
```

- [ ] Check `apps/web/tests/nav-items.test.ts` — if it asserts the exact `admin` href list, add `/dashboard/academic-years` to the expected array there too.

- [ ] Run: `cd apps/web && npm test`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/lib/dashboard/nav-items.ts apps/web/src/components/academic-years apps/web/src/app/dashboard/academic-years apps/web/tests/nav-items.test.ts
git commit -m "Add Academic Years dashboard page"
```

---

## Task 3: Promotion engine — start/resume a run and class mappings

**Files:**
- Create: `apps/web/src/lib/promotion.ts`
- Create: `apps/web/tests/promotion-engine.test.ts`

**Interfaces consumed:** `getActiveAcademicYear`, `resolveAcademicYear` (Task 1), `getEnrolledStudents` (Task 1).

**Interfaces produced (used by Tasks 4–6):**
- `startOrResumePromotionRun(prisma, params: { schoolId, initiatedById, toAcademicYearId }): Promise<StartPromotionRunResult>`
- `updateMappings(prisma, params: { promotionRunId, schoolId, mappings: { fromClassId, toClassId: number | null }[] }): Promise<UpdateMappingsResult>`

### Step 1: `startOrResumePromotionRun`

- [ ] Write the failing test first — create `apps/web/tests/promotion-engine.test.ts` with just this describe block:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";

describe("startOrResumePromotionRun", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedSchoolWithActiveYearAndClass() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550991111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 1", section: "A" },
    });
    const gradeTwo = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 2", section: "A" },
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-1" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    return { school, fromYear, admin, gradeOne, gradeTwo, student };
  }

  it("creates a draft run with auto-generated mappings for every class with active enrollments", async () => {
    const { startOrResumePromotionRun } = await import("../src/lib/promotion");
    const { school, fromYear, admin, gradeOne } = await seedSchoolWithActiveYearAndClass();
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });

    const result = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mappings).toEqual([
      { fromClassId: gradeOne.id, toClassId: null },
    ]);

    const run = await prisma.promotionRun.findUnique({ where: { id: result.id } });
    expect(run?.status).toBe("draft");
    expect(run?.fromAcademicYearId).toBe(fromYear.id);
  });

  it("resumes the existing draft run instead of creating a second one", async () => {
    const { startOrResumePromotionRun } = await import("../src/lib/promotion");
    const { school, admin } = await seedSchoolWithActiveYearAndClass();
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });

    const first = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    const second = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });

    expect(first.ok && second.ok && first.id === second.id).toBe(true);
    const runs = await prisma.promotionRun.findMany({ where: { schoolId: school.id } });
    expect(runs).toHaveLength(1);
  });

  it("returns NO_ACTIVE_YEAR when the school has no active academic year", async () => {
    const { startOrResumePromotionRun } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Yearless School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550998888", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });

    const result = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(result).toEqual({ ok: false, error: "NO_ACTIVE_YEAR" });
  });
});
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts`. Expected: FAIL (`Cannot find module '../src/lib/promotion'`).

- [ ] Create `apps/web/src/lib/promotion.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export interface PromotionMappingRow {
  fromClassId: number;
  toClassId: number | null;
}

export type StartPromotionRunResult =
  | { ok: true; id: number; mappings: PromotionMappingRow[] }
  | { ok: false; error: "INVALID_ACADEMIC_YEAR" }
  | { ok: false; error: "NO_ACTIVE_YEAR" };

export async function startOrResumePromotionRun(
  prisma: PrismaClient,
  params: { schoolId: number; initiatedById: number; toAcademicYearId: number }
): Promise<StartPromotionRunResult> {
  const existingDraft = await prisma.promotionRun.findFirst({
    where: { schoolId: params.schoolId, status: "draft" },
    include: { mappings: true },
  });
  if (existingDraft) {
    return {
      ok: true,
      id: existingDraft.id,
      mappings: existingDraft.mappings.map((mapping) => ({
        fromClassId: mapping.fromClassId,
        toClassId: mapping.toClassId,
      })),
    };
  }

  const fromYear = await prisma.academicYear.findFirst({
    where: { schoolId: params.schoolId, status: "active" },
  });
  if (!fromYear) {
    return { ok: false, error: "NO_ACTIVE_YEAR" };
  }

  const toYear = await prisma.academicYear.findFirst({
    where: { id: params.toAcademicYearId, schoolId: params.schoolId },
  });
  if (!toYear) {
    return { ok: false, error: "INVALID_ACADEMIC_YEAR" };
  }

  const classesWithEnrollments = await prisma.class.findMany({
    where: {
      schoolId: params.schoolId,
      enrollments: { some: { academicYearId: fromYear.id, status: "active" } },
    },
  });

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.promotionRun.create({
      data: {
        schoolId: params.schoolId,
        fromAcademicYearId: fromYear.id,
        toAcademicYearId: toYear.id,
        initiatedById: params.initiatedById,
        status: "draft",
      },
    });

    // No structured "grade level" exists on Class (a deliberate design choice --
    // see the design spec's "Admin defines mapping each time" decision), so there
    // is no reliable signal to guess a target class from. Every mapping starts
    // unmapped; the admin picks every target explicitly in the wizard's UI.
    const mappingData = classesWithEnrollments.map((klass) => ({
      promotionRunId: created.id,
      fromClassId: klass.id,
      toClassId: null,
    }));

    if (mappingData.length > 0) {
      await tx.promotionMapping.createMany({ data: mappingData });
    }

    return created;
  });

  const mappings = await prisma.promotionMapping.findMany({ where: { promotionRunId: run.id } });

  return {
    ok: true,
    id: run.id,
    mappings: mappings.map((mapping) => ({
      fromClassId: mapping.fromClassId,
      toClassId: mapping.toClassId,
    })),
  };
}
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts -t startOrResumePromotionRun`. Expected: PASS.

- [ ] Commit: `git add apps/web/src/lib/promotion.ts apps/web/tests/promotion-engine.test.ts && git commit -m "Add startOrResumePromotionRun"`

### Step 2: `updateMappings`

- [ ] Write the failing test — append to `apps/web/tests/promotion-engine.test.ts`:

```ts
describe("updateMappings", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("overwrites the toClassId for an existing mapping", async () => {
    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550981111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 1", section: "A" },
    });
    const gradeTwo = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 2", section: "A" },
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-2" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const result = await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }],
    });
    expect(result).toEqual({ ok: true });

    const mapping = await prisma.promotionMapping.findFirst({
      where: { promotionRunId: started.id, fromClassId: gradeOne.id },
    });
    expect(mapping?.toClassId).toBe(gradeTwo.id);
  });

  it("rejects a run id that doesn't belong to the caller's school with 404-equivalent error", async () => {
    const { updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });

    const result = await updateMappings(prisma, {
      promotionRunId: 999999,
      schoolId: school.id,
      mappings: [],
    });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    void otherSchool;
  });

  it("rejects a fromClassId that isn't part of this run's mappings", async () => {
    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550982222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const unrelatedClass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "Z" },
    });
    void fromYear;

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const result = await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: unrelatedClass.id, toClassId: null }],
    });
    expect(result).toEqual({ ok: false, error: "INVALID_MAPPING" });
  });
});
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts -t updateMappings`. Expected: FAIL (`updateMappings is not a function`).

- [ ] Add to `apps/web/src/lib/promotion.ts`:

```ts
export type UpdateMappingsResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_MAPPING" };

export async function updateMappings(
  prisma: PrismaClient,
  params: {
    promotionRunId: number;
    schoolId: number;
    mappings: Array<{ fromClassId: number; toClassId: number | null }>;
  }
): Promise<UpdateMappingsResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
    include: { mappings: true },
  });
  if (!run) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const existingFromClassIds = new Set(run.mappings.map((mapping) => mapping.fromClassId));
  for (const mapping of params.mappings) {
    if (!existingFromClassIds.has(mapping.fromClassId)) {
      return { ok: false, error: "INVALID_MAPPING" };
    }
  }

  await prisma.$transaction(
    params.mappings.map((mapping) =>
      prisma.promotionMapping.update({
        where: {
          promotionRunId_fromClassId: {
            promotionRunId: params.promotionRunId,
            fromClassId: mapping.fromClassId,
          },
        },
        data: { toClassId: mapping.toClassId },
      })
    )
  );

  return { ok: true };
}
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts`. Expected: all pass (both describe blocks).

- [ ] Commit: `git add apps/web/src/lib/promotion.ts apps/web/tests/promotion-engine.test.ts && git commit -m "Add updateMappings"`

---

## Task 4: Promotion engine — roster review, student decisions, and summary

**Files:**
- Modify: `apps/web/src/lib/promotion.ts`
- Modify: `apps/web/tests/promotion-engine.test.ts`

**Interfaces produced (used by Task 5–6):**
- `getRosterForReview(prisma, params: { promotionRunId, schoolId }): Promise<GetRosterForReviewResult>`
- `setStudentDecisions(prisma, params: { promotionRunId, schoolId, decisions: { studentId, action, toClassId? }[] }): Promise<SetDecisionsResult>`
- `getRunSummary(prisma, params: { promotionRunId, schoolId }): Promise<GetRunSummaryResult>`

### Step 1: `getRosterForReview`

- [ ] Write the failing test — append a new describe block to `apps/web/tests/promotion-engine.test.ts`:

```ts
describe("getRosterForReview / setStudentDecisions / getRunSummary", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedRunWithTwoStudents() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550971111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 1", section: "A" },
    });
    const gradeTwo = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 2", section: "A" },
    });
    const studentA = await prisma.student.create({
      data: { schoolId: school.id, name: "Student A", dob: new Date("2016-01-01"), admissionNo: "SCH-A" },
    });
    const studentB = await prisma.student.create({
      data: { schoolId: school.id, name: "Student B", dob: new Date("2016-01-01"), admissionNo: "SCH-B" },
    });
    await prisma.enrollment.create({
      data: { studentId: studentA.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    await prisma.enrollment.create({
      data: { studentId: studentB.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const { startOrResumePromotionRun, updateMappings } = await import("../src/lib/promotion");
    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    if (!started.ok) throw new Error("setup failed");
    await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }],
    });

    return { school, fromYear, toYear, admin, gradeOne, gradeTwo, studentA, studentB, runId: started.id };
  }

  it("defaults every student to a 'promoted' decision to their mapped class", async () => {
    const { getRosterForReview } = await import("../src/lib/promotion");
    const { school, runId, gradeOne, gradeTwo, studentA, studentB } = await seedRunWithTwoStudents();

    const result = await getRosterForReview(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const classGroup = result.classes.find((c) => c.fromClassId === gradeOne.id);
    expect(classGroup?.toClassId).toBe(gradeTwo.id);
    expect(classGroup?.students).toEqual(
      expect.arrayContaining([
        { studentId: studentA.id, name: "Student A", action: "promoted", toClassId: gradeTwo.id },
        { studentId: studentB.id, name: "Student B", action: "promoted", toClassId: gradeTwo.id },
      ])
    );
  });

  it("rejects a run id that doesn't belong to the caller's school", async () => {
    const { getRosterForReview } = await import("../src/lib/promotion");
    const school = await prisma.school.create({ data: { name: "Another School" } });
    const result = await getRosterForReview(prisma, { promotionRunId: 999999, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("setStudentDecisions overrides individual students and getRunSummary reflects it", async () => {
    const { setStudentDecisions, getRunSummary } = await import("../src/lib/promotion");
    const { school, runId, studentA, studentB } = await seedRunWithTwoStudents();

    const setResult = await setStudentDecisions(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      decisions: [
        { studentId: studentA.id, action: "retained" },
        { studentId: studentB.id, action: "graduated" },
      ],
    });
    expect(setResult).toEqual({ ok: true });

    const summary = await getRunSummary(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.counts).toEqual({ promoted: 0, retained: 1, graduated: 1, transferred: 0, left: 0, inactive: 0 });
    expect(summary.undecidedStudentIds).toEqual([]);
  });

  it("setStudentDecisions rejects a 'promoted' action with no resolvable target class", async () => {
    const { setStudentDecisions, updateMappings } = await import("../src/lib/promotion");
    const { school, runId, gradeOne, studentA } = await seedRunWithTwoStudents();
    // Clear the class mapping so "promoted" has no implicit target.
    await updateMappings(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: null }],
    });

    const result = await setStudentDecisions(prisma, {
      promotionRunId: runId,
      schoolId: school.id,
      decisions: [{ studentId: studentA.id, action: "promoted" }],
    });
    expect(result).toEqual({ ok: false, error: "MISSING_TARGET_CLASS" });
  });

  it("getRunSummary lists students with no decision yet as undecided by default", async () => {
    const { getRunSummary } = await import("../src/lib/promotion");
    const { school, runId, studentA, studentB } = await seedRunWithTwoStudents();

    const summary = await getRunSummary(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    // Both students default to "promoted" (mapped), so nothing is undecided yet --
    // this asserts the counts reflect the defaults, and undecided only appears for
    // students whose class has no mapping and no explicit override.
    expect(summary.counts.promoted).toBe(2);
    expect(summary.undecidedStudentIds).toEqual([]);
    void studentA;
    void studentB;
  });
});
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts -t "getRosterForReview / setStudentDecisions / getRunSummary"`. Expected: FAIL (functions don't exist).

### Step 2: Implementation

- [ ] Add to `apps/web/src/lib/promotion.ts` (add `EnrollmentStatus` to the existing `import type { PrismaClient } from "@prisma/client";` line, making it `import type { PrismaClient, EnrollmentStatus } from "@prisma/client";`):

```ts
export interface RosterStudentRow {
  studentId: number;
  name: string;
  action: EnrollmentStatus | null;
  toClassId: number | null;
}

export interface RosterClassGroup {
  fromClassId: number;
  toClassId: number | null;
  students: RosterStudentRow[];
}

export type GetRosterForReviewResult =
  | { ok: true; classes: RosterClassGroup[] }
  | { ok: false; error: "NOT_FOUND" };

export async function getRosterForReview(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<GetRosterForReviewResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
    include: { mappings: true },
  });
  if (!run) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const logEntries = await prisma.promotionLogEntry.findMany({
    where: { promotionRunId: params.promotionRunId },
  });

  const classes: RosterClassGroup[] = [];
  for (const mapping of run.mappings) {
    const enrolled = await prisma.enrollment.findMany({
      where: {
        classId: mapping.fromClassId,
        academicYearId: run.fromAcademicYearId,
        status: "active",
      },
      include: { student: true },
      orderBy: { student: { name: "asc" } },
    });

    const students: RosterStudentRow[] = enrolled.map((enrollment) => {
      const override = logEntries.find((entry) => entry.studentId === enrollment.studentId);
      if (override) {
        return {
          studentId: enrollment.studentId,
          name: enrollment.student.name,
          action: override.action,
          toClassId: override.toClassId,
        };
      }
      if (mapping.toClassId) {
        return {
          studentId: enrollment.studentId,
          name: enrollment.student.name,
          action: "promoted",
          toClassId: mapping.toClassId,
        };
      }
      return {
        studentId: enrollment.studentId,
        name: enrollment.student.name,
        action: null,
        toClassId: null,
      };
    });

    classes.push({ fromClassId: mapping.fromClassId, toClassId: mapping.toClassId, students });
  }

  return { ok: true, classes };
}

export type SetDecisionsResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "STUDENT_NOT_IN_RUN" }
  | { ok: false; error: "MISSING_TARGET_CLASS" };

export async function setStudentDecisions(
  prisma: PrismaClient,
  params: {
    promotionRunId: number;
    schoolId: number;
    decisions: Array<{ studentId: number; action: EnrollmentStatus; toClassId?: number }>;
  }
): Promise<SetDecisionsResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
    include: { mappings: true },
  });
  if (!run) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      academicYearId: run.fromAcademicYearId,
      status: "active",
      classId: { in: run.mappings.map((mapping) => mapping.fromClassId) },
      studentId: { in: params.decisions.map((decision) => decision.studentId) },
    },
  });
  const enrollmentByStudent = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment]));

  const resolved: Array<{
    studentId: number;
    fromClassId: number;
    action: EnrollmentStatus;
    toClassId: number | null;
  }> = [];

  for (const decision of params.decisions) {
    const enrollment = enrollmentByStudent.get(decision.studentId);
    if (!enrollment) {
      return { ok: false, error: "STUDENT_NOT_IN_RUN" };
    }

    let toClassId: number | null = null;
    if (decision.action === "promoted" || decision.action === "retained") {
      if (decision.action === "retained") {
        toClassId = enrollment.classId;
      } else {
        const mapping = run.mappings.find((m) => m.fromClassId === enrollment.classId);
        toClassId = decision.toClassId ?? mapping?.toClassId ?? null;
      }
      if (!toClassId) {
        return { ok: false, error: "MISSING_TARGET_CLASS" };
      }
    }

    resolved.push({
      studentId: decision.studentId,
      fromClassId: enrollment.classId,
      action: decision.action,
      toClassId,
    });
  }

  await prisma.$transaction(
    resolved.map((entry) =>
      prisma.promotionLogEntry.upsert({
        where: {
          promotionRunId_studentId: {
            promotionRunId: params.promotionRunId,
            studentId: entry.studentId,
          },
        },
        create: {
          promotionRunId: params.promotionRunId,
          studentId: entry.studentId,
          fromClassId: entry.fromClassId,
          toClassId: entry.toClassId,
          action: entry.action,
        },
        update: { toClassId: entry.toClassId, action: entry.action },
      })
    )
  );

  return { ok: true };
}

export interface PromotionCounts {
  promoted: number;
  retained: number;
  graduated: number;
  transferred: number;
  left: number;
  inactive: number;
}

export type GetRunSummaryResult =
  | { ok: true; counts: PromotionCounts; undecidedStudentIds: number[] }
  | { ok: false; error: "NOT_FOUND" };

export async function getRunSummary(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<GetRunSummaryResult> {
  const rosterResult = await getRosterForReview(prisma, params);
  if (!rosterResult.ok) {
    return rosterResult;
  }

  const counts: PromotionCounts = {
    promoted: 0,
    retained: 0,
    graduated: 0,
    transferred: 0,
    left: 0,
    inactive: 0,
  };
  const undecidedStudentIds: number[] = [];

  for (const classGroup of rosterResult.classes) {
    for (const student of classGroup.students) {
      if (student.action === null) {
        undecidedStudentIds.push(student.studentId);
        continue;
      }
      counts[student.action] += 1;
    }
  }

  return { ok: true, counts, undecidedStudentIds };
}
```

(`getRunSummary` reuses `getRosterForReview` rather than re-querying, keeping the "what counts as decided" logic in one place.)

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts`. Expected: all pass.

- [ ] Commit: `git add apps/web/src/lib/promotion.ts apps/web/tests/promotion-engine.test.ts && git commit -m "Add getRosterForReview/setStudentDecisions/getRunSummary"`

---

## Task 5: Promotion engine — confirm and revert

**Files:**
- Modify: `apps/web/src/lib/promotion.ts`
- Modify: `apps/web/tests/promotion-engine.test.ts`

**Interfaces produced (used by Task 6):**
- `confirmPromotionRun(prisma, params: { promotionRunId, schoolId }): Promise<ConfirmPromotionRunResult>`
- `revertPromotionRun(prisma, params: { promotionRunId, schoolId }): Promise<RevertPromotionRunResult>`

### Step 1: `confirmPromotionRun`

- [ ] Write the failing test — append to `apps/web/tests/promotion-engine.test.ts`:

```ts
describe("confirmPromotionRun / revertPromotionRun", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedReadyRun() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550961111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 1", section: "A" },
    });
    const gradeTwo = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 2", section: "A" },
    });
    const promotedStudent = await prisma.student.create({
      data: { schoolId: school.id, name: "Promoted Student", dob: new Date("2016-01-01"), admissionNo: "SCH-P" },
    });
    const retainedStudent = await prisma.student.create({
      data: { schoolId: school.id, name: "Retained Student", dob: new Date("2016-01-01"), admissionNo: "SCH-R" },
    });
    const graduatedStudent = await prisma.student.create({
      data: { schoolId: school.id, name: "Graduated Student", dob: new Date("2010-01-01"), admissionNo: "SCH-G" },
    });
    await prisma.enrollment.create({
      data: { studentId: promotedStudent.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    await prisma.enrollment.create({
      data: { studentId: retainedStudent.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    await prisma.enrollment.create({
      data: { studentId: graduatedStudent.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const { startOrResumePromotionRun, updateMappings, setStudentDecisions } = await import(
      "../src/lib/promotion"
    );
    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    if (!started.ok) throw new Error("setup failed");
    await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }],
    });
    await setStudentDecisions(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      decisions: [
        { studentId: retainedStudent.id, action: "retained" },
        { studentId: graduatedStudent.id, action: "graduated" },
      ],
    });
    // promotedStudent is left at its default ("promoted") -- no explicit decision needed.

    return {
      school,
      fromYear,
      toYear,
      gradeOne,
      gradeTwo,
      promotedStudent,
      retainedStudent,
      graduatedStudent,
      runId: started.id,
    };
  }

  it("archives the old year, activates the new year, and creates correct new-year enrollments", async () => {
    const { confirmPromotionRun } = await import("../src/lib/promotion");
    const { school, fromYear, toYear, gradeOne, gradeTwo, promotedStudent, retainedStudent, graduatedStudent, runId } =
      await seedReadyRun();

    const result = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: true });

    const updatedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(updatedFromYear?.status).toBe("archived");
    const updatedToYear = await prisma.academicYear.findUnique({ where: { id: toYear.id } });
    expect(updatedToYear?.status).toBe("active");

    const promotedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: promotedStudent.id, academicYearId: toYear.id } },
    });
    expect(promotedEnrollment).toMatchObject({ classId: gradeTwo.id, status: "active" });

    const retainedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: retainedStudent.id, academicYearId: toYear.id } },
    });
    expect(retainedEnrollment).toMatchObject({ classId: gradeOne.id, status: "active" });

    const graduatedNewEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: graduatedStudent.id, academicYearId: toYear.id } },
    });
    expect(graduatedNewEnrollment).toBeNull();

    const oldGraduatedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: graduatedStudent.id, academicYearId: fromYear.id } },
    });
    expect(oldGraduatedEnrollment?.status).toBe("graduated");

    const graduatedStudentRow = await prisma.student.findUnique({ where: { id: graduatedStudent.id } });
    expect(graduatedStudentRow?.status).toBe("graduated");

    const run = await prisma.promotionRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe("confirmed");
    expect(run?.confirmedAt).not.toBeNull();

    const logEntries = await prisma.promotionLogEntry.findMany({ where: { promotionRunId: runId } });
    expect(logEntries).toHaveLength(3);
  });

  it("rejects confirming when a student in a mapped class has no decision", async () => {
    const { startOrResumePromotionRun, updateMappings, confirmPromotionRun } = await import(
      "../src/lib/promotion"
    );
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550962222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 1", section: "A" },
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Undecided Student", dob: new Date("2016-01-01"), admissionNo: "SCH-U" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });

    const started = await startOrResumePromotionRun(prisma, {
      schoolId: school.id,
      initiatedById: admin.id,
      toAcademicYearId: toYear.id,
    });
    if (!started.ok) throw new Error("setup failed");
    // Leave gradeOne unmapped -- the student has no default decision, so they're undecided.
    await updateMappings(prisma, {
      promotionRunId: started.id,
      schoolId: school.id,
      mappings: [{ fromClassId: gradeOne.id, toClassId: null }],
    });

    const result = await confirmPromotionRun(prisma, { promotionRunId: started.id, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "UNDECIDED_STUDENTS" });

    const unchangedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(unchangedFromYear?.status).toBe("active");
  });
});
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts -t confirmPromotionRun`. Expected: FAIL.

- [ ] Add to `apps/web/src/lib/promotion.ts`:

```ts
export type ConfirmPromotionRunResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "UNDECIDED_STUDENTS" };

export async function confirmPromotionRun(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<ConfirmPromotionRunResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
  });
  if (!run) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const rosterResult = await getRosterForReview(prisma, params);
  if (!rosterResult.ok) {
    return rosterResult;
  }

  const allStudents = rosterResult.classes.flatMap((classGroup) => classGroup.students);
  if (allStudents.some((student) => student.action === null)) {
    return { ok: false, error: "UNDECIDED_STUDENTS" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.academicYear.update({ where: { id: run.fromAcademicYearId }, data: { status: "archived" } });
    await tx.academicYear.update({ where: { id: run.toAcademicYearId }, data: { status: "active" } });

    for (const student of allStudents) {
      if (student.action === null) {
        // Unreachable -- the UNDECIDED_STUDENTS check above already guarantees no
        // student here has a null action. This narrows `student.action` from
        // `EnrollmentStatus | null` to `EnrollmentStatus` for TypeScript, since the
        // check above ran on a separate `.some()` pass over the same array and TS
        // can't carry that guarantee across into this loop on its own.
        continue;
      }

      if (student.action === "promoted" || student.action === "retained") {
        await tx.enrollment.create({
          data: {
            studentId: student.studentId,
            classId: student.toClassId as number,
            academicYearId: run.toAcademicYearId,
            status: "active",
          },
        });
      }

      await tx.enrollment.updateMany({
        where: { studentId: student.studentId, academicYearId: run.fromAcademicYearId },
        data: { status: student.action },
      });

      if (student.action !== "promoted" && student.action !== "retained") {
        await tx.student.update({ where: { id: student.studentId }, data: { status: student.action } });
      }

      const classGroup = rosterResult.classes.find((group) =>
        group.students.some((s) => s.studentId === student.studentId)
      );
      await tx.promotionLogEntry.upsert({
        where: {
          promotionRunId_studentId: { promotionRunId: params.promotionRunId, studentId: student.studentId },
        },
        create: {
          promotionRunId: params.promotionRunId,
          studentId: student.studentId,
          fromClassId: classGroup?.fromClassId as number,
          toClassId: student.toClassId,
          action: student.action,
        },
        update: { toClassId: student.toClassId, action: student.action },
      });
    }

    await tx.promotionRun.update({
      where: { id: params.promotionRunId },
      data: { status: "confirmed", confirmedAt: new Date() },
    });
  });

  return { ok: true };
}
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts -t confirmPromotionRun`. Expected: PASS.

- [ ] Commit: `git add apps/web/src/lib/promotion.ts apps/web/tests/promotion-engine.test.ts && git commit -m "Add confirmPromotionRun"`

### Step 2: `revertPromotionRun`

- [ ] Write the failing test — append to the `confirmPromotionRun / revertPromotionRun` describe block in `apps/web/tests/promotion-engine.test.ts`:

```ts
  it("reverts a promotion run before any activity is recorded against the new year", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { school, fromYear, toYear, gradeOne, promotedStudent, retainedStudent, graduatedStudent, runId } =
      await seedReadyRun();

    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: true });

    const revertedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(revertedFromYear?.status).toBe("active");
    const revertedToYear = await prisma.academicYear.findUnique({ where: { id: toYear.id } });
    expect(revertedToYear?.status).toBe("upcoming");

    const newYearEnrollments = await prisma.enrollment.findMany({ where: { academicYearId: toYear.id } });
    expect(newYearEnrollments).toHaveLength(0);

    const oldPromotedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: promotedStudent.id, academicYearId: fromYear.id } },
    });
    expect(oldPromotedEnrollment).toMatchObject({ classId: gradeOne.id, status: "active" });

    const oldRetainedEnrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: retainedStudent.id, academicYearId: fromYear.id } },
    });
    expect(oldRetainedEnrollment?.status).toBe("active");

    const graduatedStudentRow = await prisma.student.findUnique({ where: { id: graduatedStudent.id } });
    expect(graduatedStudentRow?.status).toBe("active");

    const run = await prisma.promotionRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe("reverted");
  });

  it("rejects reverting once the new year has activity recorded against it", async () => {
    const { confirmPromotionRun, revertPromotionRun } = await import("../src/lib/promotion");
    const { school, toYear, runId } = await seedReadyRun();

    await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    await prisma.exam.create({
      data: {
        schoolId: school.id,
        academicYearId: toYear.id,
        name: "Unit Test",
        term: "Term 1",
        examDate: new Date("2027-09-01"),
      },
    });

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "YEAR_HAS_ACTIVITY" });
  });

  it("rejects reverting a run that was never confirmed", async () => {
    const { revertPromotionRun } = await import("../src/lib/promotion");
    const { school, runId } = await seedReadyRun();

    const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
    expect(result).toEqual({ ok: false, error: "NOT_CONFIRMED" });
  });
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts -t revertPromotionRun`. Expected: FAIL.

- [ ] Add to `apps/web/src/lib/promotion.ts`:

```ts
export type RevertPromotionRunResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "NOT_CONFIRMED" }
  | { ok: false; error: "YEAR_HAS_ACTIVITY" };

export async function revertPromotionRun(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<RevertPromotionRunResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
    include: { toAcademicYear: true },
  });
  if (!run) {
    return { ok: false, error: "NOT_FOUND" };
  }
  if (run.status !== "confirmed") {
    return { ok: false, error: "NOT_CONFIRMED" };
  }

  const [examCount, feeStructureCount, timetableCount, classTeacherCount, assignmentCount, attendanceCount] =
    await Promise.all([
      prisma.exam.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.feeStructure.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.timetableEntry.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.classTeacher.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.assignment.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.attendance.count({
        where: { date: { gte: run.toAcademicYear.startDate, lte: run.toAcademicYear.endDate } },
      }),
    ]);

  if (
    examCount > 0 ||
    feeStructureCount > 0 ||
    timetableCount > 0 ||
    classTeacherCount > 0 ||
    assignmentCount > 0 ||
    attendanceCount > 0
  ) {
    return { ok: false, error: "YEAR_HAS_ACTIVITY" };
  }

  const logEntries = await prisma.promotionLogEntry.findMany({
    where: { promotionRunId: params.promotionRunId },
  });

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.deleteMany({ where: { academicYearId: run.toAcademicYearId } });

    for (const entry of logEntries) {
      await tx.enrollment.updateMany({
        where: { studentId: entry.studentId, academicYearId: run.fromAcademicYearId },
        data: { status: "active" },
      });
      if (entry.action !== "promoted" && entry.action !== "retained") {
        await tx.student.update({ where: { id: entry.studentId }, data: { status: "active" } });
      }
    }

    await tx.academicYear.update({ where: { id: run.fromAcademicYearId }, data: { status: "active" } });
    await tx.academicYear.update({ where: { id: run.toAcademicYearId }, data: { status: "upcoming" } });
    await tx.promotionRun.update({ where: { id: params.promotionRunId }, data: { status: "reverted" } });
  });

  return { ok: true };
}
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-engine.test.ts`. Expected: all pass (entire file, every describe block).

- [ ] Commit: `git add apps/web/src/lib/promotion.ts apps/web/tests/promotion-engine.test.ts && git commit -m "Add revertPromotionRun"`

---

## Task 6: Promotion API routes

**Files:**
- Create: `apps/web/src/app/api/promotion-runs/route.ts`
- Create: `apps/web/src/app/api/promotion-runs/[id]/mappings/route.ts`
- Create: `apps/web/src/app/api/promotion-runs/[id]/roster/route.ts`
- Create: `apps/web/src/app/api/promotion-runs/[id]/decisions/route.ts`
- Create: `apps/web/src/app/api/promotion-runs/[id]/summary/route.ts`
- Create: `apps/web/src/app/api/promotion-runs/[id]/confirm/route.ts`
- Create: `apps/web/src/app/api/promotion-runs/[id]/revert/route.ts`
- Create: `apps/web/tests/promotion-runs-api.test.ts`

All routes are `requireApiRole(["admin"])` only — this is a structural, admin-only operation per the design spec.

### Step 1: `POST /api/promotion-runs`

- [ ] Create `apps/web/src/app/api/promotion-runs/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { startOrResumePromotionRun } from "@/lib/promotion";

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let toAcademicYearId: number | undefined;
    try {
      ({ toAcademicYearId } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!toAcademicYearId) {
      return NextResponse.json({ error: "toAcademicYearId is required" }, { status: 400 });
    }

    const result = await startOrResumePromotionRun(prisma, {
      schoolId: claims.schoolId,
      initiatedById: claims.userId,
      toAcademicYearId,
    });

    if (!result.ok) {
      if (result.error === "NO_ACTIVE_YEAR") {
        return NextResponse.json(
          { error: "No active academic year is configured" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "The selected academic year does not exist" },
        { status: 400 }
      );
    }

    return NextResponse.json({ id: result.id, mappings: result.mappings });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/tests/promotion-runs-api.test.ts` with the first test:

```ts
import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { POST as postPromotionRuns } from "../src/app/api/promotion-runs/route";
import {
  PUT as putMappings,
} from "../src/app/api/promotion-runs/[id]/mappings/route";
import { GET as getRoster } from "../src/app/api/promotion-runs/[id]/roster/route";
import { PUT as putDecisions } from "../src/app/api/promotion-runs/[id]/decisions/route";
import { GET as getSummary } from "../src/app/api/promotion-runs/[id]/summary/route";
import { POST as postConfirm } from "../src/app/api/promotion-runs/[id]/confirm/route";
import { POST as postRevert } from "../src/app/api/promotion-runs/[id]/revert/route";

describe("/api/promotion-runs", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  function loginAs(userId: number, role: "admin" | "teacher", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  async function seedSchoolReadyForPromotion() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550951111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 1", section: "A" },
    });
    const gradeTwo = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 2", section: "A" },
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-API1" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    return { school, fromYear, toYear, admin, gradeOne, gradeTwo, student };
  }

  it("creates a draft run", async () => {
    const { school, toYear, admin } = await seedSchoolReadyForPromotion();
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/promotion-runs", {
      method: "POST",
      body: JSON.stringify({ toAcademicYearId: toYear.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postPromotionRuns(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBeTypeOf("number");
  });

  it("rejects a teacher with 403", async () => {
    const { school, toYear, admin } = await seedSchoolReadyForPromotion();
    const teacher = await prisma.user.create({
      data: { phone: "+15550952222", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    void admin;
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/promotion-runs", {
      method: "POST",
      body: JSON.stringify({ toAcademicYearId: toYear.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postPromotionRuns(request);
    expect(response.status).toBe(403);
  });
});
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-runs-api.test.ts`. Expected: FAIL (other route modules don't exist yet — the import lines throw). Proceed to the next steps below before this file can pass as a whole; the two tests above should still both fail with a module-resolution error, not an assertion error, confirming the wiring is right so far.

### Step 2: Remaining routes

- [ ] Create `apps/web/src/app/api/promotion-runs/[id]/mappings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { updateMappings } from "@/lib/promotion";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    let mappings: Array<{ fromClassId: number; toClassId: number | null }> | undefined;
    try {
      ({ mappings } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!mappings) {
      return NextResponse.json({ error: "mappings is required" }, { status: 400 });
    }

    const result = await updateMappings(prisma, {
      promotionRunId,
      schoolId: claims.schoolId,
      mappings,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "One or more classes are not part of this promotion run" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/src/app/api/promotion-runs/[id]/roster/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getRosterForReview } from "@/lib/promotion";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    const result = await getRosterForReview(prisma, { promotionRunId, schoolId: claims.schoolId });
    if (!result.ok) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    return NextResponse.json({ classes: result.classes });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/src/app/api/promotion-runs/[id]/decisions/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { setStudentDecisions } from "@/lib/promotion";
import type { EnrollmentStatus } from "@prisma/client";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    let decisions: Array<{ studentId: number; action: EnrollmentStatus; toClassId?: number }> | undefined;
    try {
      ({ decisions } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!decisions || decisions.length === 0) {
      return NextResponse.json({ error: "decisions is required" }, { status: 400 });
    }

    const result = await setStudentDecisions(prisma, {
      promotionRunId,
      schoolId: claims.schoolId,
      decisions,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
      }
      if (result.error === "STUDENT_NOT_IN_RUN") {
        return NextResponse.json(
          { error: "One or more students are not part of this promotion run" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "toClassId is required when action is \"promoted\"" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/src/app/api/promotion-runs/[id]/summary/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getRunSummary } from "@/lib/promotion";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    const result = await getRunSummary(prisma, { promotionRunId, schoolId: claims.schoolId });
    if (!result.ok) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    return NextResponse.json({ counts: result.counts, undecidedStudentIds: result.undecidedStudentIds });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/src/app/api/promotion-runs/[id]/confirm/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { confirmPromotionRun } from "@/lib/promotion";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    const result = await confirmPromotionRun(prisma, { promotionRunId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "All students must have a decision before confirming" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/src/app/api/promotion-runs/[id]/revert/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { revertPromotionRun } from "@/lib/promotion";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    const result = await revertPromotionRun(prisma, { promotionRunId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
      }
      if (result.error === "NOT_CONFIRMED") {
        return NextResponse.json({ error: "This promotion run was never confirmed" }, { status: 400 });
      }
      return NextResponse.json(
        {
          error:
            "This promotion can no longer be undone — the new year already has data recorded against it",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Append a full-lifecycle integration test to `apps/web/tests/promotion-runs-api.test.ts` (inside the existing `describe("/api/promotion-runs")` block):

```ts
  it("runs the full wizard lifecycle: create, map, review, decide, confirm, revert", async () => {
    const { school, fromYear, toYear, admin, gradeOne, gradeTwo, student } =
      await seedSchoolReadyForPromotion();
    loginAs(admin.id, "admin", school.id);

    const createRequest = new Request("http://localhost/api/promotion-runs", {
      method: "POST",
      body: JSON.stringify({ toAcademicYearId: toYear.id }),
      headers: { "content-type": "application/json" },
    });
    const createResponse = await postPromotionRuns(createRequest);
    const { id: runId } = await createResponse.json();

    const mappingsRequest = new Request(`http://localhost/api/promotion-runs/${runId}/mappings`, {
      method: "PUT",
      body: JSON.stringify({ mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }] }),
      headers: { "content-type": "application/json" },
    });
    expect((await putMappings(mappingsRequest, { params: { id: String(runId) } })).status).toBe(200);

    const rosterResponse = await getRoster(
      new Request(`http://localhost/api/promotion-runs/${runId}/roster`),
      { params: { id: String(runId) } }
    );
    expect(rosterResponse.status).toBe(200);
    const rosterBody = await rosterResponse.json();
    expect(rosterBody.classes[0].students[0]).toMatchObject({
      studentId: student.id,
      action: "promoted",
      toClassId: gradeTwo.id,
    });

    const decisionsRequest = new Request(`http://localhost/api/promotion-runs/${runId}/decisions`, {
      method: "PUT",
      body: JSON.stringify({ decisions: [{ studentId: student.id, action: "retained" }] }),
      headers: { "content-type": "application/json" },
    });
    expect((await putDecisions(decisionsRequest, { params: { id: String(runId) } })).status).toBe(200);

    const summaryResponse = await getSummary(
      new Request(`http://localhost/api/promotion-runs/${runId}/summary`),
      { params: { id: String(runId) } }
    );
    const summaryBody = await summaryResponse.json();
    expect(summaryBody.counts.retained).toBe(1);
    expect(summaryBody.undecidedStudentIds).toEqual([]);

    const confirmResponse = await postConfirm(
      new Request(`http://localhost/api/promotion-runs/${runId}/confirm`, { method: "POST" }),
      { params: { id: String(runId) } }
    );
    expect(confirmResponse.status).toBe(200);

    const activeYear = await prisma.academicYear.findUnique({ where: { id: toYear.id } });
    expect(activeYear?.status).toBe("active");

    const revertResponse = await postRevert(
      new Request(`http://localhost/api/promotion-runs/${runId}/revert`, { method: "POST" }),
      { params: { id: String(runId) } }
    );
    expect(revertResponse.status).toBe(200);

    const revertedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(revertedFromYear?.status).toBe("active");
  });
```

- [ ] Run: `cd apps/web && npx vitest run tests/promotion-runs-api.test.ts`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/app/api/promotion-runs apps/web/tests/promotion-runs-api.test.ts
git commit -m "Add Promotion Runs API routes"
```

---

## Task 7: Promotion Wizard UI

**Files:**
- Create: `apps/web/src/app/dashboard/academic-years/promote/page.tsx`
- Create: `apps/web/src/components/academic-years/PromotionWizard.tsx`
- Modify: `apps/web/src/lib/dashboard/nav-items.ts` is **not** changed here — the wizard is reached via a link/button from the `/dashboard/academic-years` page, not a separate nav item.
- Modify: `apps/web/src/components/academic-years/AcademicYearsView.tsx` (add a "Start Promotion Wizard" link)

This task is UI-only, wiring up the APIs from Task 6. No new lib code.

### Step 1: Link from Academic Years page to the wizard

- [ ] In `apps/web/src/components/academic-years/AcademicYearsView.tsx`, add near the top of the returned JSX (right after the `<div className="flex flex-wrap items-center gap-2">...</div>` block that creates a new year):

```tsx
      <div className="mt-4">
        <a href="/dashboard/academic-years/promote" className="text-sm text-blue-600 underline">
          Start Academic Year Promotion Wizard
        </a>
      </div>
```

### Step 2: The wizard component

- [ ] Create `apps/web/src/components/academic-years/PromotionWizard.tsx`:

```tsx
"use client";

import { useState } from "react";

interface AcademicYearOption {
  id: number;
  name: string;
  status: "upcoming" | "active" | "archived";
}

interface RosterStudent {
  studentId: number;
  name: string;
  action: "promoted" | "retained" | "graduated" | "transferred" | "left" | "inactive" | null;
  toClassId: number | null;
}

interface RosterClassGroup {
  fromClassId: number;
  toClassId: number | null;
  students: RosterStudent[];
}

const ACTIONS: RosterStudent["action"][] = [
  "promoted",
  "retained",
  "graduated",
  "transferred",
  "left",
  "inactive",
];

export function PromotionWizard({
  upcomingYears,
  classes,
}: {
  upcomingYears: AcademicYearOption[];
  classes: { id: number; name: string; section: string }[];
}) {
  const [toAcademicYearId, setToAcademicYearId] = useState(
    upcomingYears[0] ? String(upcomingYears[0].id) : ""
  );
  const [runId, setRunId] = useState<number | null>(null);
  const [mappings, setMappings] = useState<Record<number, string>>({});
  const [roster, setRoster] = useState<RosterClassGroup[]>([]);
  const [summary, setSummary] = useState<{
    counts: Record<string, number>;
    undecidedStudentIds: number[];
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function classLabel(classId: number) {
    const klass = classes.find((c) => c.id === classId);
    return klass ? `${klass.name} ${klass.section}` : String(classId);
  }

  async function handleStart() {
    setError(null);
    const response = await fetch("/api/promotion-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toAcademicYearId: Number(toAcademicYearId) }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    const body = await response.json();
    setRunId(body.id);
    const initialMappings: Record<number, string> = {};
    for (const mapping of body.mappings) {
      initialMappings[mapping.fromClassId] = mapping.toClassId ? String(mapping.toClassId) : "";
    }
    setMappings(initialMappings);
  }

  async function handleSaveMappings() {
    if (!runId) return;
    setError(null);
    const response = await fetch(`/api/promotion-runs/${runId}/mappings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mappings: Object.entries(mappings).map(([fromClassId, toClassId]) => ({
          fromClassId: Number(fromClassId),
          toClassId: toClassId ? Number(toClassId) : null,
        })),
      }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await handleLoadRoster();
  }

  async function handleLoadRoster() {
    if (!runId) return;
    const response = await fetch(`/api/promotion-runs/${runId}/roster`);
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    const body = await response.json();
    setRoster(body.classes);
  }

  async function handleSetAction(studentId: number, action: RosterStudent["action"]) {
    if (!runId || !action) return;
    setError(null);
    const response = await fetch(`/api/promotion-runs/${runId}/decisions`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decisions: [{ studentId, action }] }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await handleLoadRoster();
  }

  async function handleLoadSummary() {
    if (!runId) return;
    const response = await fetch(`/api/promotion-runs/${runId}/summary`);
    const body = await response.json();
    setSummary(body);
  }

  async function handleConfirm() {
    if (!runId) return;
    setError(null);
    const response = await fetch(`/api/promotion-runs/${runId}/confirm`, { method: "POST" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setConfirmed(true);
  }

  async function handleUndo() {
    if (!runId) return;
    setError(null);
    const response = await fetch(`/api/promotion-runs/${runId}/revert`, { method: "POST" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setConfirmed(false);
  }

  return (
    <div className="mt-4 space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!runId && (
        <div className="flex items-center gap-2">
          <select
            aria-label="New academic year"
            value={toAcademicYearId}
            onChange={(event) => setToAcademicYearId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            {upcomingYears.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleStart}
            className="rounded bg-blue-600 px-3 py-1 text-white"
          >
            Start Promotion
          </button>
        </div>
      )}

      {runId && !confirmed && (
        <>
          <section>
            <h2 className="font-semibold text-gray-800">1. Map classes</h2>
            {Object.keys(mappings).map((fromClassId) => (
              <div key={fromClassId} className="flex items-center gap-2 py-1">
                <span>{classLabel(Number(fromClassId))} →</span>
                <select
                  aria-label={`Target class for ${classLabel(Number(fromClassId))}`}
                  value={mappings[Number(fromClassId)]}
                  onChange={(event) =>
                    setMappings((prev) => ({ ...prev, [Number(fromClassId)]: event.target.value }))
                  }
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">No mapping — review individually</option>
                  {classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.name} {klass.section}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              type="button"
              onClick={handleSaveMappings}
              className="mt-2 rounded bg-blue-600 px-3 py-1 text-white"
            >
              Save Mappings &amp; Load Roster
            </button>
          </section>

          {roster.length > 0 && (
            <section>
              <h2 className="font-semibold text-gray-800">2. Review students</h2>
              {roster.map((group) => (
                <div key={group.fromClassId} className="mt-2">
                  <h3 className="text-sm font-medium text-gray-600">{classLabel(group.fromClassId)}</h3>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {group.students.map((student) => (
                        <tr key={student.studentId}>
                          <td className="border-b border-gray-100 py-1">{student.name}</td>
                          <td className="border-b border-gray-100 py-1">
                            <select
                              aria-label={`Decision for ${student.name}`}
                              value={student.action ?? ""}
                              onChange={(event) =>
                                handleSetAction(
                                  student.studentId,
                                  event.target.value as RosterStudent["action"]
                                )
                              }
                              className="rounded border border-gray-300 px-2 py-1"
                            >
                              <option value="">Undecided</option>
                              {ACTIONS.map((action) => (
                                <option key={action} value={action ?? undefined}>
                                  {action}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <button
                type="button"
                onClick={handleLoadSummary}
                className="mt-2 rounded bg-blue-600 px-3 py-1 text-white"
              >
                Review Summary
              </button>
            </section>
          )}

          {summary && (
            <section>
              <h2 className="font-semibold text-gray-800">3. Summary &amp; confirm</h2>
              <ul className="text-sm">
                {Object.entries(summary.counts).map(([action, count]) => (
                  <li key={action}>
                    {action}: {count}
                  </li>
                ))}
              </ul>
              {summary.undecidedStudentIds.length > 0 ? (
                <p className="text-sm text-red-600">
                  {summary.undecidedStudentIds.length} student(s) still need a decision.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="mt-2 rounded bg-green-700 px-3 py-1 text-white"
                >
                  Confirm Promotion
                </button>
              )}
            </section>
          )}
        </>
      )}

      {confirmed && (
        <div>
          <p className="text-sm text-green-700">Promotion complete.</p>
          <button type="button" onClick={handleUndo} className="mt-2 rounded bg-red-600 px-3 py-1 text-white">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] Create `apps/web/src/app/dashboard/academic-years/promote/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listAcademicYears } from "@/lib/academic-years";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { PromotionWizard } from "@/components/academic-years/PromotionWizard";

export default async function PromoteAcademicYearPage() {
  const claims = requireDashboardRole(["admin"]);
  const [years, classes] = await Promise.all([
    listAcademicYears(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);
  const upcomingYears = years.filter((year) => year.status === "upcoming");

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Academic Year Promotion</h1>
      <p className="mt-1 text-sm text-gray-600">
        Create a new academic year on the Academic Years page first if none is listed below.
      </p>
      <PromotionWizard upcomingYears={upcomingYears} classes={classes} />
    </div>
  );
}
```

- [ ] Start the dev server and manually walk through the wizard end-to-end as an admin (create an academic year on `/dashboard/academic-years`, then use `/dashboard/academic-years/promote` to map a class, decide on a student, confirm, and verify the "Undo" button works) to confirm no client-side errors. Use the `run` skill or `preview_start`/`preview_click`/`preview_console_logs` tools to drive this rather than claiming it works from reading the code.

- [ ] Commit:

```bash
git add apps/web/src/components/academic-years/PromotionWizard.tsx apps/web/src/app/dashboard/academic-years
git commit -m "Add Promotion Wizard UI"
```

---

## Task 8: Final verification

- [ ] Run the full test suite: `cd apps/web && npm test`. Expected: every test file passes.
- [ ] Run a production build to catch any type errors the test runner's esbuild transform doesn't surface: `cd apps/web && npm run build`. Expected: build succeeds with no TypeScript errors.
- [ ] Manually smoke-test the golden path in a browser (via the `run` or preview tools): log in as admin, create a second academic year, run the promotion wizard for a class with at least two students (promote one, retain one), confirm, and verify the previously-active year now shows "archived" on `/dashboard/academic-years` and no longer accepts a new attendance/marks/fee entry (expect the archived-year 400 error surfaced by Task 1's guard).
- [ ] Commit any final fixes discovered during manual testing with a clear message, then stop — this plan's scope ends here. The year-switcher UI for browsing archived years' Attendance/Marks/Timetable/Assignments/Fees data (flagged as out of scope in the Global Constraints section) is a natural follow-up but is not part of this plan.
