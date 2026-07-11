# Parent Detail Pages (Full History) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each parent home page card (Attendance, Assignments, Marks, Fees) a link to a dedicated detail page showing that module's complete history for the active child.

**Architecture:** Extract two small pieces of already-working logic for reuse (`resolveActiveChild` for child-switcher tampering-safe lookup, `buildAttendanceMonthDays`/`attendancePercent` for the calendar grid), add four new small data-layer modules (one per detail page, mirroring the existing `overview.ts` style), extract two presentational components (`MonthCalendar`, `ExamBreakdown`) so the home cards and detail pages render identical visuals without duplicated JSX, then add the four new pages and wire the home page cards to link to them.

**Tech Stack:** Next.js (App Router) server/client components, Prisma/PostgreSQL, Vitest + Testing Library, Tailwind CSS.

## Global Constraints

- No pagination in this pass — explicitly deferred per the spec.
- These pages are fully read-only, same as the rest of `/parent/*`.
- No isolated unit tests for the four new page files themselves — consistent with the established precedent for every other `/parent/*` page (thin server-component composition of already-tested pieces); verified manually in the final task instead.
- Every new/refactored piece of logic gets its own test file per Global convention already used throughout `apps/web/tests/`.
- Follow existing code style: no comments unless explaining non-obvious "why", Tailwind utility classes matching the existing neutral/emerald/amber/red palette already used across `/parent/*`.

---

### Task 1: `resolveActiveChild` shared helper

**Files:**
- Create: `apps/web/src/lib/parent/resolve-child.ts`
- Modify: `apps/web/src/app/parent/page.tsx`
- Test: `apps/web/tests/resolve-child.test.ts`

**Interfaces:**
- Produces: `resolveActiveChild<T extends { id: number }>(children: T[], requestedId: number | undefined): T` — callers must guard for an empty `children` array before calling (same contract the inline logic in `/parent/page.tsx` already has today). Consumed by all four new pages in Tasks 9–12, and by the refactored `/parent/page.tsx` in this task.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/resolve-child.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveActiveChild } from "../src/lib/parent/resolve-child";

describe("resolveActiveChild", () => {
  const children = [
    { id: 1, name: "Rohan" },
    { id: 2, name: "Meera" },
  ];

  it("returns the child matching requestedId", () => {
    expect(resolveActiveChild(children, 2)).toEqual({ id: 2, name: "Meera" });
  });

  it("falls back to the first child when requestedId is undefined", () => {
    expect(resolveActiveChild(children, undefined)).toEqual({ id: 1, name: "Rohan" });
  });

  it("falls back to the first child when requestedId matches no child", () => {
    expect(resolveActiveChild(children, 999)).toEqual({ id: 1, name: "Rohan" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/resolve-child.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/parent/resolve-child'`

- [ ] **Step 3: Implement `resolveActiveChild`**

Create `apps/web/src/lib/parent/resolve-child.ts`:

```ts
export function resolveActiveChild<T extends { id: number }>(
  children: T[],
  requestedId: number | undefined
): T {
  return children.find((child) => child.id === requestedId) ?? children[0];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/resolve-child.test.ts`
Expected: PASS

- [ ] **Step 5: Refactor `/parent/page.tsx` to use it**

In `apps/web/src/app/parent/page.tsx`, add the import:

```tsx
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren, getParentOverview } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { AttendanceCard, AssignmentsCard, MarksCard, FeesCard } from "@/components/parent/SummaryCards";
```

and replace:

```tsx
  const requestedId = searchParams.studentId ? Number(searchParams.studentId) : undefined;
  const activeChild =
    children.find((child) => child.id === requestedId) ?? children[0];
```

with:

```tsx
  const requestedId = searchParams.studentId ? Number(searchParams.studentId) : undefined;
  const activeChild = resolveActiveChild(children, requestedId);
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/parent/resolve-child.ts apps/web/tests/resolve-child.test.ts apps/web/src/app/parent/page.tsx
git commit -m "Extract resolveActiveChild helper for reuse across parent pages"
```

---

### Task 2: Export `buildAttendanceMonthDays`/`attendancePercent` from `overview.ts`

**Files:**
- Modify: `apps/web/src/lib/parent/overview.ts`
- Test: none new — this is a pure refactor; existing `apps/web/tests/parent-overview.test.ts` must keep passing unchanged as the regression check.

**Interfaces:**
- Produces: `buildAttendanceMonthDays(records: { date: Date; status: string }[], year: number, month: number): ParentAttendanceDay[]` and `attendancePercent(records: { status: string }[]): number`, both now exported. Consumed by `attendance-history.ts` in Task 3.

- [ ] **Step 1: Export the two helpers and use the extracted builder inside `getParentOverview`**

In `apps/web/src/lib/parent/overview.ts`, change:

```ts
function attendancePercent(records: { status: string }[]): number {
  if (records.length === 0) return 0;
  const attended = records.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / records.length) * 100);
}
```

to:

```ts
export function attendancePercent(records: { status: string }[]): number {
  if (records.length === 0) return 0;
  const attended = records.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

export function buildAttendanceMonthDays(
  records: { date: Date; status: string }[],
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
    });
  }
  return days;
}
```

Then, inside `getParentOverview`, replace the inline loop:

```ts
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
```

with:

```ts
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const attendanceDays = buildAttendanceMonthDays(attendanceRecords, year, month);
```

- [ ] **Step 2: Run the existing parent-overview tests to confirm no regression**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/parent-overview.test.ts`
Expected: PASS (all existing tests, unchanged, still pass — this proves the refactor preserved behavior)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/parent/overview.ts
git commit -m "Export buildAttendanceMonthDays/attendancePercent for reuse"
```

---

### Task 3: Attendance history data layer

**Files:**
- Create: `apps/web/src/lib/parent/attendance-history.ts`
- Test: `apps/web/tests/attendance-history.test.ts`

**Interfaces:**
- Consumes: `buildAttendanceMonthDays`, `attendancePercent`, `ParentAttendanceDay` from `apps/web/src/lib/parent/overview.ts` (Task 2).
- Produces: `ParentAttendanceMonth { year: number; month: number; monthLabel: string; percent: number; days: ParentAttendanceDay[]; prevMonth: string; nextMonth: string }` and `getParentAttendanceMonth(prisma, params: { studentId: number; month?: string }): Promise<ParentAttendanceMonth>`. Consumed by `/parent/attendance/page.tsx` in Task 9.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/attendance-history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentAttendanceMonth } from "../src/lib/parent/attendance-history";

describe("getParentAttendanceMonth", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns the requested month's attendance days and percent", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.attendance.createMany({
      data: [
        {
          studentId: fixtures.student.id,
          date: new Date("2026-06-02"),
          status: "present",
          markedById: fixtures.teacher.id,
        },
        {
          studentId: fixtures.student.id,
          date: new Date("2026-06-03"),
          status: "absent",
          markedById: fixtures.teacher.id,
        },
      ],
    });

    const result = await getParentAttendanceMonth(prisma, {
      studentId: fixtures.student.id,
      month: "2026-06",
    });

    expect(result.year).toBe(2026);
    expect(result.month).toBe(5);
    expect(result.monthLabel).toBe("June 2026");
    expect(result.percent).toBe(50);
    expect(result.days).toHaveLength(30);
    expect(result.days.find((d) => d.dayOfMonth === 2)?.status).toBe("present");
    expect(result.prevMonth).toBe("2026-05");
    expect(result.nextMonth).toBe("2026-07");
  });

  it("defaults to the current month when month is omitted", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const now = new Date();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const expectedLabel = `${monthNames[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

    const result = await getParentAttendanceMonth(prisma, { studentId: fixtures.student.id });

    expect(result.monthLabel).toBe(expectedLabel);
  });

  it("wraps prevMonth/nextMonth across a year boundary", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const result = await getParentAttendanceMonth(prisma, {
      studentId: fixtures.student.id,
      month: "2026-01",
    });

    expect(result.prevMonth).toBe("2025-12");
    expect(result.nextMonth).toBe("2026-02");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/attendance-history.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/parent/attendance-history'`

- [ ] **Step 3: Implement `attendance-history.ts`**

Create `apps/web/src/lib/parent/attendance-history.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { attendancePercent, buildAttendanceMonthDays, type ParentAttendanceDay } from "./overview";

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
    select: { date: true, status: true },
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/attendance-history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/parent/attendance-history.ts apps/web/tests/attendance-history.test.ts
git commit -m "Add attendance history data layer with month navigation"
```

---

### Task 4: Assignments history data layer

**Files:**
- Create: `apps/web/src/lib/parent/assignments-history.ts`
- Test: `apps/web/tests/assignments-history.test.ts`

**Interfaces:**
- Consumes: `displayStatus` from `apps/web/src/lib/assignments.ts`.
- Produces: `ParentAssignmentHistoryEntry { id: number; subject: string; title: string; dueDate: string; status: "pending" | "submitted" | "overdue"; className: string }` and `getParentAssignmentHistory(prisma, studentId: number): Promise<ParentAssignmentHistoryEntry[]>`. Consumed by `/parent/assignments/page.tsx` in Task 10.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/assignments-history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentAssignmentHistory } from "../src/lib/parent/assignments-history";

describe("getParentAssignmentHistory", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns every assignment status for the student regardless of status, newest due date first", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const older = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "Mathematics",
        title: "Worksheet 1",
        dueDate: new Date("2026-07-01"),
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    const newer = await prisma.assignment.create({
      data: {
        classId: fixtures.classA.id,
        subject: "Science",
        title: "Lab Report",
        dueDate: new Date("2026-08-01"),
        createdById: fixtures.teacher.id,
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: older.id, studentId: fixtures.student.id, status: "submitted" },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: newer.id, studentId: fixtures.student.id, status: "pending" },
    });

    const history = await getParentAssignmentHistory(prisma, fixtures.student.id);

    expect(history).toHaveLength(2);
    expect(history[0].title).toBe("Lab Report");
    expect(history[0].status).toBe("pending");
    expect(history[0].className).toBe("Grade 5 A");
    expect(history[1].title).toBe("Worksheet 1");
    expect(history[1].status).toBe("submitted");
  });

  it("returns an empty array when the student has no assignment statuses", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const history = await getParentAssignmentHistory(prisma, fixtures.student.id);

    expect(history).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/assignments-history.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/parent/assignments-history'`

- [ ] **Step 3: Implement `assignments-history.ts`**

Create `apps/web/src/lib/parent/assignments-history.ts`:

```ts
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
```

Note: `displayStatus` is currently a non-exported function in `apps/web/src/lib/assignments.ts` re-exported at the bottom via `export { displayStatus, isOverdue };` — confirm this export line is present (it already is, added for the parent-login feature's `overview.ts`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/assignments-history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/parent/assignments-history.ts apps/web/tests/assignments-history.test.ts
git commit -m "Add assignments history data layer"
```

---

### Task 5: Marks history data layer

**Files:**
- Create: `apps/web/src/lib/parent/marks-history.ts`
- Test: `apps/web/tests/marks-history.test.ts`

**Interfaces:**
- Consumes: `ParentExamSubject` type from `apps/web/src/lib/parent/overview.ts`.
- Produces: `ParentExamHistoryEntry { examId: number; examName: string; term: string; examDate: string; subjects: ParentExamSubject[] }` and `getParentMarksHistory(prisma, studentId: number): Promise<ParentExamHistoryEntry[]>`. Consumed by `/parent/marks/page.tsx` in Task 11.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/marks-history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentMarksHistory } from "../src/lib/parent/marks-history";

describe("getParentMarksHistory", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("groups marks by exam, newest exam first, with full subject breakdowns", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const olderExam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Mid Term",
        term: "Term 1",
        examDate: new Date("2026-08-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    const newerExam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Final Term",
        term: "Term 2",
        examDate: new Date("2026-12-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.mark.create({
      data: { examId: olderExam.id, studentId: fixtures.student.id, subject: "Mathematics", marksObtained: 70, maxMarks: 100, grade: "C" },
    });
    await prisma.mark.create({
      data: { examId: newerExam.id, studentId: fixtures.student.id, subject: "Mathematics", marksObtained: 91, maxMarks: 100, grade: "A" },
    });
    await prisma.mark.create({
      data: { examId: newerExam.id, studentId: fixtures.student.id, subject: "Science", marksObtained: 85, maxMarks: 100, grade: "B" },
    });

    const history = await getParentMarksHistory(prisma, fixtures.student.id);

    expect(history).toHaveLength(2);
    expect(history[0].examName).toBe("Final Term");
    expect(history[0].subjects).toHaveLength(2);
    expect(history[1].examName).toBe("Mid Term");
    expect(history[1].subjects).toHaveLength(1);
  });

  it("returns an empty array when the student has no marks", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const history = await getParentMarksHistory(prisma, fixtures.student.id);

    expect(history).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/marks-history.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/parent/marks-history'`

- [ ] **Step 3: Implement `marks-history.ts`**

Create `apps/web/src/lib/parent/marks-history.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { ParentExamSubject } from "./overview";

export interface ParentExamHistoryEntry {
  examId: number;
  examName: string;
  term: string;
  examDate: string;
  subjects: ParentExamSubject[];
}

export async function getParentMarksHistory(
  prisma: PrismaClient,
  studentId: number
): Promise<ParentExamHistoryEntry[]> {
  const marks = await prisma.mark.findMany({
    where: { studentId },
    include: { exam: true },
    orderBy: { exam: { examDate: "desc" } },
  });

  const examsById = new Map<number, ParentExamHistoryEntry>();
  for (const mark of marks) {
    let entry = examsById.get(mark.examId);
    if (!entry) {
      entry = {
        examId: mark.examId,
        examName: mark.exam.name,
        term: mark.exam.term,
        examDate: mark.exam.examDate.toISOString().slice(0, 10),
        subjects: [],
      };
      examsById.set(mark.examId, entry);
    }
    entry.subjects.push({
      subject: mark.subject,
      marksObtained: mark.marksObtained,
      maxMarks: mark.maxMarks,
      grade: mark.grade,
    });
  }

  return Array.from(examsById.values());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/marks-history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/parent/marks-history.ts apps/web/tests/marks-history.test.ts
git commit -m "Add marks history data layer"
```

---

### Task 6: Fees history data layer

**Files:**
- Create: `apps/web/src/lib/parent/fees-history.ts`
- Test: `apps/web/tests/fees-history.test.ts`

**Interfaces:**
- Produces: `ParentFeeHistoryEntry { id: number; term: string; className: string; academicYearName: string; amount: number; amountPaid: number; status: "paid" | "partial" | "unpaid"; dueDate: string }` and `getParentFeesHistory(prisma, studentId: number): Promise<ParentFeeHistoryEntry[]>`. Consumed by `/parent/fees/page.tsx` in Task 12.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/fees-history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentFeesHistory } from "../src/lib/parent/fees-history";

describe("getParentFeesHistory", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns fee structures across every class/year the student has been enrolled in", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const priorYear = await prisma.academicYear.create({
      data: {
        schoolId: fixtures.school.id,
        name: "2025-26",
        startDate: new Date("2025-06-01"),
        endDate: new Date("2026-04-30"),
        status: "archived",
      },
    });
    const priorClass = await prisma.class.create({
      data: { schoolId: fixtures.school.id, name: "Grade 4", section: "A" },
    });
    await prisma.enrollment.create({
      data: {
        studentId: fixtures.student.id,
        classId: priorClass.id,
        academicYearId: priorYear.id,
        status: "promoted",
        rollNumber: "OLD-001",
      },
    });

    const currentStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 1",
        amount: 5000,
        dueDate: new Date("2026-09-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    const priorStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: priorClass.id,
        term: "Term 1",
        amount: 4000,
        dueDate: new Date("2025-09-01"),
        academicYearId: priorYear.id,
      },
    });
    await prisma.feePayment.create({
      data: {
        studentId: fixtures.student.id,
        feeStructureId: priorStructure.id,
        amountPaid: 4000,
        recordedById: fixtures.accountant.id,
        status: "paid",
      },
    });

    const history = await getParentFeesHistory(prisma, fixtures.student.id);

    expect(history).toHaveLength(2);
    const current = history.find((h) => h.id === currentStructure.id);
    const prior = history.find((h) => h.id === priorStructure.id);
    expect(current?.status).toBe("unpaid");
    expect(current?.amountPaid).toBe(0);
    expect(prior?.status).toBe("paid");
    expect(prior?.amountPaid).toBe(4000);
    expect(prior?.className).toBe("Grade 4 A");
  });

  it("returns an empty array when the student has no enrollment history", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.enrollment.deleteMany({ where: { studentId: fixtures.student.id } });

    const history = await getParentFeesHistory(prisma, fixtures.student.id);

    expect(history).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/fees-history.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/parent/fees-history'`

- [ ] **Step 3: Implement `fees-history.ts`**

Create `apps/web/src/lib/parent/fees-history.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export interface ParentFeeHistoryEntry {
  id: number;
  term: string;
  className: string;
  academicYearName: string;
  amount: number;
  amountPaid: number;
  status: "paid" | "partial" | "unpaid";
  dueDate: string;
}

export async function getParentFeesHistory(
  prisma: PrismaClient,
  studentId: number
): Promise<ParentFeeHistoryEntry[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    select: { classId: true, academicYearId: true },
  });

  if (enrollments.length === 0) return [];

  const feeStructures = await prisma.feeStructure.findMany({
    where: {
      OR: enrollments.map((enrollment) => ({
        classId: enrollment.classId,
        academicYearId: enrollment.academicYearId,
      })),
    },
    include: {
      class: true,
      academicYear: true,
      payments: { where: { studentId } },
    },
    orderBy: { dueDate: "desc" },
  });

  return feeStructures.map((structure) => {
    const payment = structure.payments[0];
    return {
      id: structure.id,
      term: structure.term,
      className: `${structure.class.name} ${structure.class.section}`,
      academicYearName: structure.academicYear.name,
      amount: structure.amount,
      amountPaid: payment?.amountPaid ?? 0,
      status: payment?.status ?? "unpaid",
      dueDate: structure.dueDate.toISOString().slice(0, 10),
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/fees-history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/parent/fees-history.ts apps/web/tests/fees-history.test.ts
git commit -m "Add fees history data layer spanning all enrollment years"
```

---

### Task 7: Extract `MonthCalendar` component

**Files:**
- Create: `apps/web/src/components/parent/MonthCalendar.tsx`
- Modify: `apps/web/src/components/parent/SummaryCards.tsx`
- Test: `apps/web/tests/month-calendar.test.tsx`

**Interfaces:**
- Consumes: `ParentAttendanceDay` type from `apps/web/src/lib/parent/overview.ts`.
- Produces: `MonthCalendar({ days: ParentAttendanceDay[] })`. Consumed by `AttendanceCard` (this task) and `/parent/attendance/page.tsx` (Task 9).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/month-calendar.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MonthCalendar } from "../src/components/parent/MonthCalendar";
import type { ParentAttendanceDay } from "../src/lib/parent/overview";

describe("MonthCalendar", () => {
  afterEach(() => cleanup());

  const days: ParentAttendanceDay[] = [
    { date: "2026-08-01", dayOfMonth: 1, weekday: 6, status: "present" },
    { date: "2026-08-02", dayOfMonth: 2, weekday: 0, status: "absent" },
    { date: "2026-08-03", dayOfMonth: 3, weekday: 1, status: "late" },
    { date: "2026-08-04", dayOfMonth: 4, weekday: 2, status: null },
  ];

  it("pads the grid with blank cells so day 1 lands on its weekday", () => {
    render(<MonthCalendar days={days} />);
    expect(screen.getAllByTestId("calendar-blank")).toHaveLength(6);
  });

  it("colors each day cell by its attendance status", () => {
    render(<MonthCalendar days={days} />);
    expect(screen.getByText("1")).toHaveClass("bg-emerald-100");
    expect(screen.getByText("2")).toHaveClass("bg-red-100");
    expect(screen.getByText("3")).toHaveClass("bg-amber-100");
    expect(screen.getByText("4")).toHaveClass("bg-neutral-100");
  });

  it("renders the legend", () => {
    render(<MonthCalendar days={days} />);
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getByText("Late")).toBeInTheDocument();
    expect(screen.getByText("Absent")).toBeInTheDocument();
    expect(screen.getByText("No record")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/month-calendar.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/parent/MonthCalendar'`

- [ ] **Step 3: Implement `MonthCalendar`**

Create `apps/web/src/components/parent/MonthCalendar.tsx`:

```tsx
import type { ParentAttendanceDay } from "@/lib/parent/overview";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const ATTENDANCE_STATUS_CLASS: Record<"present" | "late" | "absent", string> = {
  present: "bg-emerald-100 text-emerald-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-700",
};

function LegendDot({ colorClassName, label }: { colorClassName: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[9px] text-neutral-400">
      <span className={`h-2 w-2 rounded-full ${colorClassName}`} />
      {label}
    </span>
  );
}

export function MonthCalendar({ days }: { days: ParentAttendanceDay[] }) {
  const leadingBlanks = days.length > 0 ? days[0].weekday : 0;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} className="text-center text-[9px] font-semibold text-neutral-400">
            {label}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <span key={`blank-${index}`} data-testid="calendar-blank" />
        ))}
        {days.map((day) => (
          <span
            key={day.date}
            className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ${
              day.status ? ATTENDANCE_STATUS_CLASS[day.status] : "bg-neutral-100 text-neutral-400"
            }`}
          >
            {day.dayOfMonth}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <LegendDot colorClassName="bg-emerald-400" label="Present" />
        <LegendDot colorClassName="bg-amber-400" label="Late" />
        <LegendDot colorClassName="bg-red-400" label="Absent" />
        <LegendDot colorClassName="bg-neutral-300" label="No record" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/month-calendar.test.tsx`
Expected: PASS

- [ ] **Step 5: Refactor `AttendanceCard` to use `MonthCalendar`**

In `apps/web/src/components/parent/SummaryCards.tsx`, add the import:

```tsx
import type { ParentAssignmentEntry, ParentAttendanceDay, ParentOverview } from "@/lib/parent/overview";
import { MonthCalendar } from "./MonthCalendar";
```

Remove the now-duplicated `WEEKDAY_LABELS`, `ATTENDANCE_STATUS_CLASS`, and `LegendDot` from this file (they now live in `MonthCalendar.tsx`). Replace:

```tsx
export function AttendanceCard({ percent, days }: { percent: number; days: ParentAttendanceDay[] }) {
  const leadingBlanks = days.length > 0 ? days[0].weekday : 0;

  return (
    <div className={cardClass}>
      <p className={titleClass}>Attendance</p>
      <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
        {percent}%
      </span>
      <span className={labelClass}>This month</span>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} className="text-center text-[9px] font-semibold text-neutral-400">
            {label}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <span key={`blank-${index}`} data-testid="calendar-blank" />
        ))}
        {days.map((day) => (
          <span
            key={day.date}
            className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ${
              day.status ? ATTENDANCE_STATUS_CLASS[day.status] : "bg-neutral-100 text-neutral-400"
            }`}
          >
            {day.dayOfMonth}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <LegendDot colorClassName="bg-emerald-400" label="Present" />
        <LegendDot colorClassName="bg-amber-400" label="Late" />
        <LegendDot colorClassName="bg-red-400" label="Absent" />
        <LegendDot colorClassName="bg-neutral-300" label="No record" />
      </div>
    </div>
  );
}
```

with:

```tsx
export function AttendanceCard({ percent, days }: { percent: number; days: ParentAttendanceDay[] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Attendance</p>
      <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
        {percent}%
      </span>
      <span className={labelClass}>This month</span>
      <div className="mt-3">
        <MonthCalendar days={days} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the existing summary-cards tests to confirm no regression**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/summary-cards.test.tsx`
Expected: PASS (unchanged test file, still passes — proves the refactor preserved `AttendanceCard`'s rendered output)

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/parent/MonthCalendar.tsx apps/web/src/components/parent/SummaryCards.tsx apps/web/tests/month-calendar.test.tsx
git commit -m "Extract MonthCalendar component for reuse between home card and detail page"
```

---

### Task 8: Extract `ExamBreakdown` component

**Files:**
- Create: `apps/web/src/components/parent/ExamBreakdown.tsx`
- Modify: `apps/web/src/components/parent/SummaryCards.tsx`
- Test: `apps/web/tests/exam-breakdown.test.tsx`

**Interfaces:**
- Consumes: `ParentExamSubject` type from `apps/web/src/lib/parent/overview.ts`.
- Produces: `ExamBreakdown({ examName: string; subjects: ParentExamSubject[] })`. Consumed by `MarksCard` (this task) and `/parent/marks/page.tsx` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/exam-breakdown.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExamBreakdown } from "../src/components/parent/ExamBreakdown";

describe("ExamBreakdown", () => {
  afterEach(() => cleanup());

  it("shows the exam name and each subject's marks/grade", () => {
    render(
      <ExamBreakdown
        examName="Final Term"
        subjects={[{ subject: "Mathematics", marksObtained: 91, maxMarks: 100, grade: "A" }]}
      />
    );
    expect(screen.getByText("Final Term")).toBeInTheDocument();
    expect(screen.getByText("Mathematics: 91/100 (A)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/exam-breakdown.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/parent/ExamBreakdown'`

- [ ] **Step 3: Implement `ExamBreakdown`**

Create `apps/web/src/components/parent/ExamBreakdown.tsx`:

```tsx
import type { ParentExamSubject } from "@/lib/parent/overview";

export function ExamBreakdown({
  examName,
  subjects,
}: {
  examName: string;
  subjects: ParentExamSubject[];
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-neutral-800">{examName}</p>
      <ul className="space-y-1">
        {subjects.map((subject) => (
          <li key={subject.subject} className="text-[11px] font-semibold text-neutral-400">
            {subject.subject}: {subject.marksObtained}/{subject.maxMarks} ({subject.grade})
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/exam-breakdown.test.tsx`
Expected: PASS

- [ ] **Step 5: Refactor `MarksCard` to use `ExamBreakdown`**

In `apps/web/src/components/parent/SummaryCards.tsx`, add the import:

```tsx
import { ExamBreakdown } from "./ExamBreakdown";
```

Replace:

```tsx
export function MarksCard({ latestExam }: { latestExam: ParentOverview["latestExam"] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Marks</p>
      {latestExam === null ? (
        <p className={labelClass}>No exams recorded yet</p>
      ) : (
        <div>
          <p className="mb-1 text-xs font-semibold text-neutral-800">{latestExam.examName}</p>
          <ul className="space-y-1">
            {latestExam.subjects.map((subject) => (
              <li key={subject.subject} className={labelClass}>
                {subject.subject}: {subject.marksObtained}/{subject.maxMarks} ({subject.grade})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

with:

```tsx
export function MarksCard({ latestExam }: { latestExam: ParentOverview["latestExam"] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Marks</p>
      {latestExam === null ? (
        <p className={labelClass}>No exams recorded yet</p>
      ) : (
        <ExamBreakdown examName={latestExam.examName} subjects={latestExam.subjects} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the existing summary-cards tests to confirm no regression**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/summary-cards.test.tsx`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/parent/ExamBreakdown.tsx apps/web/src/components/parent/SummaryCards.tsx apps/web/tests/exam-breakdown.test.tsx
git commit -m "Extract ExamBreakdown component for reuse between home card and detail page"
```

---

### Task 9: `/parent/attendance` detail page

**Files:**
- Create: `apps/web/src/app/parent/attendance/page.tsx`

**Interfaces:**
- Consumes: `requireParentRole` (Task 3 of the parent-login plan), `getParentChildren` (`overview.ts`), `resolveActiveChild` (Task 1), `getParentAttendanceMonth` (Task 3), `ChildSwitcher`, `MonthCalendar` (Task 7).
- Produces: no new exports — leaf page. No isolated test, per Global Constraints — verified manually in Task 13.

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/parent/attendance/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { getParentAttendanceMonth } from "@/lib/parent/attendance-history";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { MonthCalendar } from "@/components/parent/MonthCalendar";

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: { studentId?: string; month?: string };
}) {
  const claims = requireParentRole();
  const children = await getParentChildren(prisma, claims.userId);

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-16 text-center">
        <p className="text-sm font-bold text-neutral-800">No students linked to this account</p>
        <p className="mt-1 text-xs text-neutral-400">Contact the school office to link your child.</p>
      </div>
    );
  }

  const requestedId = searchParams.studentId ? Number(searchParams.studentId) : undefined;
  const activeChild = resolveActiveChild(children, requestedId);

  const monthData = await getParentAttendanceMonth(prisma, {
    studentId: activeChild.id,
    month: searchParams.month,
  });

  const hasRecords = monthData.days.some((day) => day.status !== null);

  return (
    <div className="space-y-4">
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <Link
        href={`/parent?studentId=${activeChild.id}`}
        className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
      >
        ← Overview
      </Link>
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={`/parent/attendance?studentId=${activeChild.id}&month=${monthData.prevMonth}`}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
          >
            ‹ Prev
          </Link>
          <div className="text-center">
            <p className="text-sm font-bold text-neutral-800">{monthData.monthLabel}</p>
            <p className="text-xs text-neutral-400">{monthData.percent}% attendance</p>
          </div>
          <Link
            href={`/parent/attendance?studentId=${activeChild.id}&month=${monthData.nextMonth}`}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
          >
            Next ›
          </Link>
        </div>
        {hasRecords ? (
          <MonthCalendar days={monthData.days} />
        ) : (
          <p className="text-xs text-neutral-400">No attendance recorded for this month</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/attendance/page.tsx
git commit -m "Add parent attendance detail page with month navigation"
```

---

### Task 10: `/parent/assignments` detail page

**Files:**
- Create: `apps/web/src/app/parent/assignments/page.tsx`

**Interfaces:**
- Consumes: `requireParentRole`, `getParentChildren`, `resolveActiveChild`, `getParentAssignmentHistory` (Task 4), `ChildSwitcher`.
- Produces: no new exports — leaf page. No isolated test, per Global Constraints — verified manually in Task 13.

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/parent/assignments/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { getParentAssignmentHistory } from "@/lib/parent/assignments-history";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";

export default async function ParentAssignmentsPage({
  searchParams,
}: {
  searchParams: { studentId?: string };
}) {
  const claims = requireParentRole();
  const children = await getParentChildren(prisma, claims.userId);

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-16 text-center">
        <p className="text-sm font-bold text-neutral-800">No students linked to this account</p>
        <p className="mt-1 text-xs text-neutral-400">Contact the school office to link your child.</p>
      </div>
    );
  }

  const requestedId = searchParams.studentId ? Number(searchParams.studentId) : undefined;
  const activeChild = resolveActiveChild(children, requestedId);
  const assignments = await getParentAssignmentHistory(prisma, activeChild.id);

  return (
    <div className="space-y-4">
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <Link
        href={`/parent?studentId=${activeChild.id}`}
        className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
      >
        ← Overview
      </Link>
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <h1 className="mb-3 text-sm font-bold text-neutral-800">Assignments</h1>
        {assignments.length === 0 ? (
          <p className="text-xs text-neutral-400">No assignments yet</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="border-b border-neutral-50 pb-2 text-xs last:border-0">
                <p className="font-semibold text-neutral-800">{assignment.title}</p>
                <p className={assignment.status === "overdue" ? "text-red-600" : "text-neutral-400"}>
                  {assignment.subject} · {assignment.className} · {assignment.dueDate} · {assignment.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/assignments/page.tsx
git commit -m "Add parent assignments detail page with full history"
```

---

### Task 11: `/parent/marks` detail page

**Files:**
- Create: `apps/web/src/app/parent/marks/page.tsx`

**Interfaces:**
- Consumes: `requireParentRole`, `getParentChildren`, `resolveActiveChild`, `getParentMarksHistory` (Task 5), `ChildSwitcher`, `ExamBreakdown` (Task 8).
- Produces: no new exports — leaf page. No isolated test, per Global Constraints — verified manually in Task 13.

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/parent/marks/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { getParentMarksHistory } from "@/lib/parent/marks-history";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { ExamBreakdown } from "@/components/parent/ExamBreakdown";

export default async function ParentMarksPage({
  searchParams,
}: {
  searchParams: { studentId?: string };
}) {
  const claims = requireParentRole();
  const children = await getParentChildren(prisma, claims.userId);

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-16 text-center">
        <p className="text-sm font-bold text-neutral-800">No students linked to this account</p>
        <p className="mt-1 text-xs text-neutral-400">Contact the school office to link your child.</p>
      </div>
    );
  }

  const requestedId = searchParams.studentId ? Number(searchParams.studentId) : undefined;
  const activeChild = resolveActiveChild(children, requestedId);
  const exams = await getParentMarksHistory(prisma, activeChild.id);

  return (
    <div className="space-y-4">
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <Link
        href={`/parent?studentId=${activeChild.id}`}
        className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
      >
        ← Overview
      </Link>
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <h1 className="mb-3 text-sm font-bold text-neutral-800">Marks</h1>
        {exams.length === 0 ? (
          <p className="text-xs text-neutral-400">No exams recorded yet</p>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => (
              <ExamBreakdown
                key={exam.examId}
                examName={`${exam.examName} (${exam.term})`}
                subjects={exam.subjects}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/marks/page.tsx
git commit -m "Add parent marks detail page with full exam history"
```

---

### Task 12: `/parent/fees` detail page

**Files:**
- Create: `apps/web/src/app/parent/fees/page.tsx`

**Interfaces:**
- Consumes: `requireParentRole`, `getParentChildren`, `resolveActiveChild`, `getParentFeesHistory` (Task 6), `ChildSwitcher`.
- Produces: no new exports — leaf page. No isolated test, per Global Constraints — verified manually in Task 13.

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/parent/fees/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { getParentFeesHistory } from "@/lib/parent/fees-history";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";

const STATUS_CLASS: Record<"paid" | "partial" | "unpaid", string> = {
  paid: "text-emerald-600",
  partial: "text-amber-600",
  unpaid: "text-red-600",
};

export default async function ParentFeesPage({
  searchParams,
}: {
  searchParams: { studentId?: string };
}) {
  const claims = requireParentRole();
  const children = await getParentChildren(prisma, claims.userId);

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-16 text-center">
        <p className="text-sm font-bold text-neutral-800">No students linked to this account</p>
        <p className="mt-1 text-xs text-neutral-400">Contact the school office to link your child.</p>
      </div>
    );
  }

  const requestedId = searchParams.studentId ? Number(searchParams.studentId) : undefined;
  const activeChild = resolveActiveChild(children, requestedId);
  const feeHistory = await getParentFeesHistory(prisma, activeChild.id);

  return (
    <div className="space-y-4">
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <Link
        href={`/parent?studentId=${activeChild.id}`}
        className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
      >
        ← Overview
      </Link>
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <h1 className="mb-3 text-sm font-bold text-neutral-800">Fees</h1>
        {feeHistory.length === 0 ? (
          <p className="text-xs text-neutral-400">No fee structures yet</p>
        ) : (
          <ul className="space-y-2">
            {feeHistory.map((fee) => (
              <li key={fee.id} className="border-b border-neutral-50 pb-2 text-xs last:border-0">
                <p className="font-semibold text-neutral-800">
                  {fee.term} · {fee.className} · {fee.academicYearName}
                </p>
                <p className={STATUS_CLASS[fee.status]}>
                  ₹{fee.amountPaid}/₹{fee.amount} · {fee.status} · Due {fee.dueDate}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/fees/page.tsx
git commit -m "Add parent fees detail page with full billing history"
```

---

### Task 13: Wire home page cards to their detail pages

**Files:**
- Modify: `apps/web/src/app/parent/page.tsx`

**Interfaces:**
- Consumes: `Link` from `next/link`; `AttendanceCard`/`AssignmentsCard`/`MarksCard`/`FeesCard` (unchanged props from Tasks 7–8).
- Produces: no new exports — visual wiring only.

- [ ] **Step 1: Wrap each card in a `Link` to its detail page**

In `apps/web/src/app/parent/page.tsx`, add the import:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren, getParentOverview } from "@/lib/parent/overview";
import { resolveActiveChild } from "@/lib/parent/resolve-child";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { AttendanceCard, AssignmentsCard, MarksCard, FeesCard } from "@/components/parent/SummaryCards";
```

Replace the cards grid:

```tsx
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AttendanceCard percent={overview.attendanceMonthPercent} days={overview.attendanceDays} />
        <AssignmentsCard assignments={overview.upcomingAssignments} />
        <MarksCard latestExam={overview.latestExam} />
        <FeesCard fees={overview.feesOutstanding} />
      </div>
```

with:

```tsx
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`/parent/attendance?studentId=${activeChild.id}`}
          className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300"
        >
          <AttendanceCard percent={overview.attendanceMonthPercent} days={overview.attendanceDays} />
        </Link>
        <Link
          href={`/parent/assignments?studentId=${activeChild.id}`}
          className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300"
        >
          <AssignmentsCard assignments={overview.upcomingAssignments} />
        </Link>
        <Link
          href={`/parent/marks?studentId=${activeChild.id}`}
          className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300"
        >
          <MarksCard latestExam={overview.latestExam} />
        </Link>
        <Link
          href={`/parent/fees?studentId=${activeChild.id}`}
          className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300"
        >
          <FeesCard fees={overview.feesOutstanding} />
        </Link>
      </div>
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/page.tsx
git commit -m "Link parent home cards to their dedicated detail pages"
```

---

### Task 14: Full-suite verification and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run`
Expected: all tests pass, including every file created/touched in Tasks 1–8.

- [ ] **Step 2: Run the typechecker across the whole app**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually walk through every detail page**

Using the dev server and a seeded parent phone number with attendance/assignment/mark/fee data:
1. Log in as a parent and land on `/parent`.
2. Hover each card — confirm a subtle shadow/border highlight appears and the cursor becomes a pointer.
3. Click the Attendance card — confirm it navigates to `/parent/attendance` showing the current month's calendar; click `‹ Prev` and `Next ›` and confirm the month label and grid update; navigate to a month with no records and confirm the "No attendance recorded for this month" empty state.
4. Click "← Overview" — confirm it returns to `/parent`.
5. Click the Assignments card — confirm `/parent/assignments` shows every assignment (any status), newest due date first, overdue ones in red.
6. Click the Marks card — confirm `/parent/marks` shows every exam with its full subject breakdown, newest exam first.
7. Click the Fees card — confirm `/parent/fees` shows every fee structure with amount due/paid/status/due date, color-coded by status.
8. For a parent with more than one child, confirm the child-switcher appears on every detail page and switching children updates that same page's content (not just the home page).

Expected: every step behaves as described above with no console errors.

- [ ] **Step 4: Report results**

If any step in Step 3 fails, fix the underlying task before proceeding — do not commit a workaround here. Once all steps pass, this plan is complete; no further commit is needed for this task.
