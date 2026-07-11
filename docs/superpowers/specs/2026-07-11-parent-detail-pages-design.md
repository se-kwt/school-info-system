# Parent Detail Pages (Full History) — Design Spec

Status: Approved — 2026-07-11

## 1. Problem

The parent home page (`/parent`) shows four summary cards — Attendance, Assignments, Marks, Fees — each intentionally truncated to "what matters right now" (this month's %, next 3 pending assignments, latest exam only, current outstanding balance). There is no way for a parent to see the full history behind any of these numbers. This spec adds a dedicated detail page per module, reached by clicking its card, showing that module's complete history for the active child.

## 2. Scope

**In scope**
- Each summary card becomes a full-card link to its detail page: `/parent/attendance`, `/parent/assignments`, `/parent/marks`, `/parent/fees`.
- Attendance detail: the same month-grid calendar as the home card, with Prev/Next controls to page through any past month.
- Assignments detail: every assignment the child has ever had a status recorded for, any status (pending/submitted/overdue), newest due date first.
- Marks detail: every exam the child has marks for, each with its full subject/grade breakdown, newest exam first.
- Fees detail: every fee structure ever assigned to a class the child was enrolled in, with amount due/paid/status/due date, newest first.
- Each detail page keeps the child-switcher (for multi-child parents) and a "← Overview" link back to `/parent`.

**Out of scope**
- Pagination — a single-school MVP's history volume doesn't warrant it yet; can be added later if a school's data grows large.
- Editing anything from these pages — still fully read-only, matching the rest of `/parent/*`.
- Any change to what the home page cards themselves show — they stay truncated summaries; only their click behavior changes.

## 3. Shared Refactors

Two small extractions serve all four detail pages, avoiding duplication:

- **`resolveActiveChild(children, requestedId)`** — the tampering-safe "pick the child matching `?studentId=`, else the first child" logic currently inlined in `/parent/page.tsx` is extracted into `src/lib/parent/resolve-child.ts` and reused by all five pages (home + 4 detail pages). `/parent/page.tsx` is refactored to use it too, removing the duplicate.
- **Attendance month-building** — the day-grid-building loop and `attendancePercent` helper currently private to `getParentOverview` are exported from `src/lib/parent/overview.ts` (`buildAttendanceMonthDays`, `attendancePercent`) so the new arbitrary-month query in `attendance-history.ts` (section 4) can reuse them instead of re-implementing the same loop.

## 4. Data Layer

Four new small, focused, independently-testable modules — one per detail page, mirroring the existing `overview.ts` style:

**`src/lib/parent/attendance-history.ts`**
```ts
export interface ParentAttendanceMonth {
  year: number;
  month: number;        // 0-11
  monthLabel: string;    // "July 2026"
  percent: number;
  days: ParentAttendanceDay[];
  prevMonth: string;      // "YYYY-MM", for the Prev link
  nextMonth: string;      // "YYYY-MM", for the Next link
}

export async function getParentAttendanceMonth(
  prisma: PrismaClient,
  params: { studentId: number; month?: string }  // month: "YYYY-MM", defaults to current month if omitted/invalid
): Promise<ParentAttendanceMonth>
```
Parses `params.month` into a year/month (falling back to the current month for missing or malformed input), fetches `Attendance` rows for that month range, and reuses `buildAttendanceMonthDays`/`attendancePercent` from `overview.ts`.

**`src/lib/parent/assignments-history.ts`**
```ts
export interface ParentAssignmentHistoryEntry {
  id: number;
  subject: string;
  title: string;
  dueDate: string;
  status: "pending" | "submitted" | "overdue";
  className: string;   // e.g. "Grade 5 A", since history can span multiple classes/years
}

export async function getParentAssignmentHistory(
  prisma: PrismaClient,
  studentId: number
): Promise<ParentAssignmentHistoryEntry[]>
```
Queries `AssignmentStatus` directly by `studentId` (no enrollment/class filter — `AssignmentStatus` rows are already permanently linked to the student regardless of which class/year they were created under, so this is inherently full history), including `assignment.class`, ordered by `assignment.dueDate` descending. Status is resolved via the existing `displayStatus` helper from `src/lib/assignments.ts`.

**`src/lib/parent/marks-history.ts`**
```ts
export interface ParentExamHistoryEntry {
  examId: number;
  examName: string;
  term: string;
  examDate: string;
  subjects: ParentExamSubject[];  // reuses the existing type from overview.ts
}

export async function getParentMarksHistory(
  prisma: PrismaClient,
  studentId: number
): Promise<ParentExamHistoryEntry[]>
```
Queries all `Mark` rows for the student (again inherently full history — `Mark.studentId` is direct, not enrollment-scoped), grouped by exam preserving newest-exam-first order, each with its complete subject list.

**`src/lib/parent/fees-history.ts`**
```ts
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
): Promise<ParentFeeHistoryEntry[]>
```
Unlike the other three, `FeeStructure` isn't linked to a student directly — it's scoped by class+academicYear. This function first collects every distinct `(classId, academicYearId)` pair from the student's `Enrollment` history (not just the current active one), then fetches all `FeeStructure` rows matching any of those pairs, each joined to its payment (if any) for this student. `status` comes from the payment's stored status, defaulting to `"unpaid"` when no payment exists yet.

## 5. UI

**Card → link wrapping** — `AttendanceCard`, `AssignmentsCard`, `MarksCard`, `FeesCard` stay presentational (no navigation knowledge). `/parent/page.tsx` wraps each one in a `<Link href="/parent/<module>?studentId=<id>" className="block rounded-2xl transition-all hover:shadow-md hover:border-neutral-300">`.

**Shared calendar/exam-breakdown extraction** — the month-grid rendering currently inline in `AttendanceCard` is extracted into a `MonthCalendar` presentational component (`src/components/parent/MonthCalendar.tsx`) so both the home card and the Attendance detail page render it identically without duplicated JSX. Likewise, the per-exam subject-list rendering in `MarksCard` is extracted into an `ExamBreakdown` component (`src/components/parent/ExamBreakdown.tsx`) reused by both the home card (one exam) and the Marks detail page (repeated per exam).

**Detail page shell** — all four detail pages share the same structure: `ChildSwitcher` (if >1 child) → a "← Overview" link to `/parent` → the module-specific content:
- **Attendance**: `‹ Prev` / month label / `Next ›` header row, then `MonthCalendar`, then the same 4-item legend as today.
- **Assignments**: a list of rows (subject · title · due date · status · class), color-coded the same way the home card already does (red for overdue).
- **Marks**: a list of `ExamBreakdown` blocks, one per exam, each headed by the exam name/term/date.
- **Fees**: a list of rows (term · class · amount due · amount paid · status · due date), status color-coded green/amber/red for paid/partial/unpaid matching the system-wide convention.

Each list has its own empty state ("No attendance recorded for this month" / "No assignments yet" / "No exams recorded yet" / "No fee structures yet"), consistent with the home cards' existing empty-state style.

## 6. Testing

- `attendance-history.test.ts`, `assignments-history.test.ts`, `marks-history.test.ts`, `fees-history.test.ts` — one file per new lib module, following the existing `parent-overview.test.ts` fixture style (`createSeedFixtures`), covering: happy path with data, empty state, and (for fees) a student with enrollment history across more than one class/year.
- `resolve-child.test.ts` — pure function, trivial unit tests (matching id found, no match falls back to first, empty list).
- Component tests for `MonthCalendar` and `ExamBreakdown` (extracted presentational components) — adapted from the existing `AttendanceCard`/`MarksCard` test assertions in `summary-cards.test.tsx`, since those exact behaviors move into the new components.
- No tests for the four new page files themselves, consistent with the established precedent for every other `/parent/*` page (thin server-component composition of already-tested pieces) — verified manually instead.

## 7. Risks & Follow-ups

- **Fees history query cost**: walking all `Enrollment` rows to collect class/year pairs before querying `FeeStructure` is an extra round trip compared to the home card's single-enrollment lookup, but bounded by how many years a student has been enrolled (small, single digits) — not a real performance concern at this scale.
- **No pagination**: explicitly deferred per section 2; if a school's assignment/exam history grows large enough to matter, add pagination as a follow-up rather than building it speculatively now.
