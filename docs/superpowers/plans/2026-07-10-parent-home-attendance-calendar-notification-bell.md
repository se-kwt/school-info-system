# Parent Home: Attendance Calendar & Notification Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the parent home page's plain "X% this month" attendance figure with a real month-grid calendar heatmap, and add a decorative-but-clickable notification bell to the `/parent` header ahead of the real notifications feature.

**Architecture:** Extend the existing `getParentOverview` data function to also return a full month's worth of per-day attendance status (reusing the `Attendance` rows it already fetches — no new queries). Rebuild `AttendanceCard` to render that as a 7-column weekday-aligned grid instead of just a number. Add a new self-contained `NotificationBell` client component (local `useState` + click-outside listener, no backend) and mount it in the existing `ParentLayout` header.

**Tech Stack:** Next.js (App Router) server/client components, Prisma/PostgreSQL, Vitest + Testing Library, Tailwind CSS, `lucide-react` icons (already a dependency — see `Sidebar.tsx`'s existing `ChevronLeft`/`ChevronRight` usage).

## Global Constraints

- No new Prisma queries — `attendanceDays` is built from the same `Attendance` rows `getParentOverview` already fetches for `attendanceMonthPercent`.
- Current month only — no month navigation in this pass (matches the rest of `/parent`, which is current-state-only).
- `NotificationBell` has no backend and no unread state — it is purely a UI placeholder (click → "Coming soon" popover → click-away or second click closes it).
- Color convention matches the existing system-wide rule (see `docs/superpowers/specs/2026-07-02-school-info-system-design.md` §7): green = good, amber = due/caution, red = bad.
- Follow existing code style: no comments unless explaining non-obvious "why", Tailwind utility classes matching the existing neutral/emerald/amber/red palette already used in `SummaryCards.tsx`.

---

### Task 1: Add `attendanceDays` to `getParentOverview`

**Files:**
- Modify: `apps/web/src/lib/parent/overview.ts`
- Test: `apps/web/tests/parent-overview.test.ts`

**Interfaces:**
- Consumes: nothing new — reuses the existing `Attendance` query and `monthRange()` helper already in this file.
- Produces: new exported interface `ParentAttendanceDay { date: string; dayOfMonth: number; weekday: number; status: "present" | "absent" | "late" | null }`; `ParentOverview` gains `attendanceDays: ParentAttendanceDay[]`. Consumed by `AttendanceCard` in Task 2.

- [ ] **Step 1: Write the failing tests**

In `apps/web/tests/parent-overview.test.ts`, replace the existing `"computes this month's attendance percent from present/late records"` test with this extended version (adds `attendanceDays` assertions to the same scenario):

```ts
  it("computes this month's attendance percent and per-day attendanceDays from present/late records", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2));
    const monthStart2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3));
    const monthStart3 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 4));

    await prisma.attendance.createMany({
      data: [
        { studentId: fixtures.student.id, date: monthStart, status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, date: monthStart2, status: "absent", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, date: monthStart3, status: "late", markedById: fixtures.teacher.id },
      ],
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.attendanceMonthPercent).toBe(67);

    const day2 = overview.attendanceDays.find((d) => d.dayOfMonth === 2);
    const day3 = overview.attendanceDays.find((d) => d.dayOfMonth === 3);
    const day4 = overview.attendanceDays.find((d) => d.dayOfMonth === 4);
    expect(day2?.status).toBe("present");
    expect(day3?.status).toBe("absent");
    expect(day4?.status).toBe("late");
  });

  it("returns a full month of attendanceDays with weekday numbers and null status for unmarked days", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const now = new Date();
    const totalDays = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const firstDayWeekday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getUTCDay();

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.attendanceDays).toHaveLength(totalDays);
    expect(overview.attendanceDays[0].dayOfMonth).toBe(1);
    expect(overview.attendanceDays[0].status).toBeNull();
    expect(overview.attendanceDays[0].weekday).toBe(firstDayWeekday);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/parent-overview.test.ts`
Expected: FAIL — `overview.attendanceDays` is `undefined`, so `.find()`/`.length`/`[0]` all throw or fail their assertions. The `ParentOverview` type also doesn't have `attendanceDays` yet.

- [ ] **Step 3: Add `attendanceDays` to `getParentOverview`**

In `apps/web/src/lib/parent/overview.ts`, add the new interface after `ParentExamSubject`:

```ts
export interface ParentAttendanceDay {
  date: string;
  dayOfMonth: number;
  weekday: number;
  status: "present" | "absent" | "late" | null;
}
```

Add `attendanceDays` to `ParentOverview`:

```ts
export interface ParentOverview {
  attendanceMonthPercent: number;
  attendanceDays: ParentAttendanceDay[];
  upcomingAssignments: ParentAssignmentEntry[];
  latestExam: { examName: string; term: string; subjects: ParentExamSubject[] } | null;
  feesOutstanding: { amount: number; nearestDueDate: string | null };
}
```

Change the attendance query to also select `date`, and build `attendanceDays` from it. Replace:

```ts
  const { start, end } = monthRange();
  const attendanceRecords = await prisma.attendance.findMany({
    where: { studentId: params.studentId, date: { gte: start, lt: end } },
    select: { status: true },
  });
  const attendanceMonthPercent = attendancePercent(attendanceRecords);
```

with:

```ts
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
```

And add `attendanceDays` to the function's final return statement. Change:

```ts
  return { attendanceMonthPercent, upcomingAssignments, latestExam, feesOutstanding };
```

to:

```ts
  return { attendanceMonthPercent, attendanceDays, upcomingAssignments, latestExam, feesOutstanding };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/parent-overview.test.ts`
Expected: PASS (all tests in the file, including the two touched in Step 1)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/parent/overview.ts apps/web/tests/parent-overview.test.ts
git commit -m "Add per-day attendanceDays to parent overview data"
```

---

### Task 2: Rebuild `AttendanceCard` as a month-grid calendar

**Files:**
- Modify: `apps/web/src/components/parent/SummaryCards.tsx`
- Modify: `apps/web/src/app/parent/page.tsx`
- Test: `apps/web/tests/summary-cards.test.tsx`

**Interfaces:**
- Consumes: `ParentAttendanceDay` type from `apps/web/src/lib/parent/overview.ts` (Task 1).
- Produces: `AttendanceCard`'s prop signature changes from `{ percent: number }` to `{ percent: number; days: ParentAttendanceDay[] }`. No other exports change.

- [ ] **Step 1: Write the failing tests**

In `apps/web/tests/summary-cards.test.tsx`, add the `ParentAttendanceDay` import and replace the `AttendanceCard` describe block. Change:

```tsx
import {
  AttendanceCard,
  AssignmentsCard,
  MarksCard,
  FeesCard,
} from "../src/components/parent/SummaryCards";
```

to:

```tsx
import {
  AttendanceCard,
  AssignmentsCard,
  MarksCard,
  FeesCard,
} from "../src/components/parent/SummaryCards";
import type { ParentAttendanceDay } from "../src/lib/parent/overview";
```

and replace:

```tsx
describe("AttendanceCard", () => {
  afterEach(() => cleanup());

  it("shows the attendance percent", () => {
    render(<AttendanceCard percent={82} />);
    expect(screen.getByText("82%")).toBeInTheDocument();
  });
});
```

with:

```tsx
describe("AttendanceCard", () => {
  afterEach(() => cleanup());

  const days: ParentAttendanceDay[] = [
    { date: "2026-08-01", dayOfMonth: 1, weekday: 6, status: "present" },
    { date: "2026-08-02", dayOfMonth: 2, weekday: 0, status: "absent" },
    { date: "2026-08-03", dayOfMonth: 3, weekday: 1, status: "late" },
    { date: "2026-08-04", dayOfMonth: 4, weekday: 2, status: null },
  ];

  it("shows the attendance percent", () => {
    render(<AttendanceCard percent={82} days={days} />);
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("pads the grid with blank cells so day 1 lands on its weekday", () => {
    render(<AttendanceCard percent={82} days={days} />);
    expect(screen.getAllByTestId("calendar-blank")).toHaveLength(6);
  });

  it("colors each day cell by its attendance status", () => {
    render(<AttendanceCard percent={82} days={days} />);
    expect(screen.getByText("1")).toHaveClass("bg-emerald-100");
    expect(screen.getByText("2")).toHaveClass("bg-red-100");
    expect(screen.getByText("3")).toHaveClass("bg-amber-100");
    expect(screen.getByText("4")).toHaveClass("bg-neutral-100");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/summary-cards.test.tsx`
Expected: FAIL — `AttendanceCard` doesn't accept a `days` prop yet and renders no grid, so `getAllByTestId("calendar-blank")` finds nothing and `getByText("1")` etc. don't exist.

- [ ] **Step 3: Rebuild `AttendanceCard`**

In `apps/web/src/components/parent/SummaryCards.tsx`, add the type import and replace the `AttendanceCard` export. Change:

```tsx
import type { ParentAssignmentEntry, ParentOverview } from "@/lib/parent/overview";
```

to:

```tsx
import type { ParentAssignmentEntry, ParentAttendanceDay, ParentOverview } from "@/lib/parent/overview";
```

and replace:

```tsx
export function AttendanceCard({ percent }: { percent: number }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Attendance</p>
      <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
        {percent}%
      </span>
      <span className={labelClass}>This month</span>
    </div>
  );
}
```

with:

```tsx
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/summary-cards.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the new prop into `/parent/page.tsx`**

In `apps/web/src/app/parent/page.tsx`, change:

```tsx
        <AttendanceCard percent={overview.attendanceMonthPercent} />
```

to:

```tsx
        <AttendanceCard percent={overview.attendanceMonthPercent} days={overview.attendanceDays} />
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/parent/SummaryCards.tsx apps/web/src/app/parent/page.tsx apps/web/tests/summary-cards.test.tsx
git commit -m "Render attendance as a month-grid calendar on the parent home page"
```

---

### Task 3: Notification bell component

**Files:**
- Create: `apps/web/src/components/parent/NotificationBell.tsx`
- Test: `apps/web/tests/notification-bell.test.tsx`

**Interfaces:**
- Consumes: `Bell` icon from `lucide-react` (already a project dependency, see `apps/web/src/components/dashboard/Sidebar.tsx`'s `ChevronLeft`/`ChevronRight` import).
- Produces: `NotificationBell()` — a self-contained client component, no props. Consumed by `/parent/layout.tsx` in Task 4.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/notification-bell.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "../src/components/parent/NotificationBell";

describe("NotificationBell", () => {
  afterEach(() => cleanup());

  it("does not show the popover initially", () => {
    render(<NotificationBell />);
    expect(screen.queryByText("Notifications are coming soon.")).not.toBeInTheDocument();
  });

  it("shows the popover after clicking the bell", async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Notifications are coming soon.")).toBeInTheDocument();
  });

  it("hides the popover after clicking elsewhere in the document", async () => {
    render(
      <div>
        <NotificationBell />
        <p>Elsewhere</p>
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Notifications are coming soon.")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Elsewhere"));
    expect(screen.queryByText("Notifications are coming soon.")).not.toBeInTheDocument();
  });

  it("hides the popover after clicking the bell a second time", async () => {
    render(<NotificationBell />);
    const button = screen.getByRole("button", { name: "Notifications" });

    await userEvent.click(button);
    expect(screen.getByText("Notifications are coming soon.")).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.queryByText("Notifications are coming soon.")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/notification-bell.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/parent/NotificationBell'`

- [ ] **Step 3: Implement `NotificationBell`**

Create `apps/web/src/components/parent/NotificationBell.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-all hover:bg-neutral-100"
      >
        <Bell className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-10 w-40 rounded-lg border border-neutral-200 bg-white p-2 text-[11px] font-medium text-neutral-600 shadow-md">
          Notifications are coming soon.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/notification-bell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/parent/NotificationBell.tsx apps/web/tests/notification-bell.test.tsx
git commit -m "Add notification bell placeholder component"
```

---

### Task 4: Mount the notification bell in the parent header

**Files:**
- Modify: `apps/web/src/app/parent/layout.tsx`

**Interfaces:**
- Consumes: `NotificationBell` from `apps/web/src/components/parent/NotificationBell.tsx` (Task 3).
- Produces: no new exports — visual wiring only.

This task has no isolated unit test — like the rest of `/parent/layout.tsx`, this is thin composition of an already-tested component (`NotificationBell`, fully covered in Task 3). It's exercised manually in Task 5's verification.

- [ ] **Step 1: Add the import and mount the bell in the header**

In `apps/web/src/app/parent/layout.tsx`, add the import:

```tsx
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { NotificationBell } from "@/components/parent/NotificationBell";
```

and change the header's right-hand group. Replace:

```tsx
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6] text-xs font-bold text-white">
            {initials}
          </div>
          <span className="text-xs font-semibold text-neutral-800">{user.name}</span>
          <form action="/api/auth/logout" method="POST">
```

with:

```tsx
        <div className="flex items-center gap-3">
          <NotificationBell />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6] text-xs font-bold text-white">
            {initials}
          </div>
          <span className="text-xs font-semibold text-neutral-800">{user.name}</span>
          <form action="/api/auth/logout" method="POST">
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/layout.tsx
git commit -m "Mount notification bell in the parent header"
```

---

### Task 5: Full-suite verification and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run`
Expected: all tests pass, including every file touched/created in Tasks 1–3.

- [ ] **Step 2: Run the typechecker across the whole app**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually walk through the updated parent home page**

Using the dev server and a seeded parent phone number (e.g. from `prisma/fixtures.ts` or the existing dev seed):
1. Log in as a parent and land on `/parent`.
2. Confirm the Attendance card now shows a 7-column calendar grid for the current month, with day 1 aligned to its correct weekday, colored cells for any seeded attendance records, and a 4-item color legend below the grid.
3. Confirm the notification bell renders in the top-right of the header, before the avatar/name/logout group.
4. Click the bell — confirm the "Notifications are coming soon." popover appears.
5. Click elsewhere on the page — confirm the popover closes.
6. Click the bell again — confirm the popover opens, then click the bell a second time — confirm it closes.

Expected: every step behaves as described above with no console errors.

- [ ] **Step 4: Report results**

If any step in Step 3 fails, fix the underlying task before proceeding — do not commit a workaround here. Once all steps pass, this plan is complete; no further commit is needed for this task.
