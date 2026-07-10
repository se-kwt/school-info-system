# Parent Home: Attendance Calendar & Notification Bell — Design Spec

Status: Approved — 2026-07-10

## 1. Problem

The parent home page (`/parent`, shipped in [2026-07-10-parent-login-design.md](2026-07-10-parent-login-design.md)) currently shows attendance as a single "X% this month" figure with no day-by-day detail, and has no notification affordance in the header even though notifications are a named MVP module in the original system design. This spec adds two small, self-contained enhancements to that existing page:

1. A calendar-grid visualization of the current month's attendance, replacing the plain percentage in `AttendanceCard`.
2. A notification bell icon in the `/parent` header, decorative-but-clickable ahead of the real notification feature (explicitly deferred — this only adds the icon and a "Coming soon" affordance, no backend).

## 2. Scope

**In scope**
- Extend `getParentOverview` to return per-day attendance status for the current calendar month.
- Rebuild `AttendanceCard` as a 7-column (Sun–Sat) month-grid heatmap, aligned to real weekdays, colored by status, with the month % retained as a header line and a small color legend.
- Add a `NotificationBell` client component to the `/parent` header: a `Bell` icon button that toggles a "Coming soon" popover on click and closes on click-away or a second click.

**Out of scope**
- Month navigation (previous/next month) on the calendar — current month only, same as the rest of the parent home page.
- Any real notification delivery, unread counts, or notification list — tracked separately, this only adds the header icon and its placeholder interaction.
- Applying the same calendar/bell treatment to the staff dashboard — parent home only.

## 3. Data Layer Changes

`ParentOverview` in `src/lib/parent/overview.ts` gains one field:

```ts
export interface ParentAttendanceDay {
  date: string;           // "YYYY-MM-DD"
  dayOfMonth: number;     // 1-31
  weekday: number;        // 0 (Sun) - 6 (Sat), via Date.getUTCDay()
  status: "present" | "absent" | "late" | null;  // null = no record for that day
}

export interface ParentOverview {
  attendanceMonthPercent: number;
  attendanceDays: ParentAttendanceDay[];   // new
  upcomingAssignments: ParentAssignmentEntry[];
  latestExam: { examName: string; term: string; subjects: ParentExamSubject[] } | null;
  feesOutstanding: { amount: number; nearestDueDate: string | null };
}
```

`getParentOverview` already fetches the current month's `Attendance` rows (via the existing `monthRange()` helper) to compute `attendanceMonthPercent`. It builds `attendanceDays` from the same query result: for every day from the 1st to the last day of the current month, look up a matching `Attendance` row by date and emit `{ date, dayOfMonth, weekday, status }`, with `status: null` when no row exists for that day. Days beyond "today" within the month are included too (they'll simply have `status: null`, rendered as not-yet-happened — same visual as "not marked").

No new Prisma queries are needed — this is a client-side (to the function, not the browser) reshape of the attendance rows already being fetched.

## 4. `AttendanceCard` Redesign

Replaces the current implementation in `src/components/parent/SummaryCards.tsx`. New props: `AttendanceCard({ percent, days }: { percent: number; days: ParentAttendanceDay[] })`.

Layout:
- Header line: `{percent}%` (large, bold, as today) + "This month" label — unchanged from the current card.
- Below that, a 7-column CSS grid, one column per weekday (Sun–Sat labeled with single-letter headers S M T W T F S). The grid is padded with empty leading cells so `days[0]` (the 1st of the month) lands in its correct `weekday` column — leading blanks count = `days[0].weekday`.
- Each day is a small square cell showing the day-of-month number, colored by status:
  - `present` → green background (`bg-emerald-100 text-emerald-700`)
  - `late` → amber background (`bg-amber-100 text-amber-700`)
  - `absent` → red background (`bg-red-100 text-red-700`)
  - `null` → neutral background (`bg-neutral-100 text-neutral-400`)
- A legend row beneath the grid: four small colored dots with labels "Present / Late / Absent / No record", using the same four colors, `text-[10px]` labels.

This is a pure presentational component (all data precomputed by `getParentOverview`) — no client-side state, no interactivity, consistent with the rest of the page's read-only cards.

## 5. Notification Bell

New file `src/components/parent/NotificationBell.tsx`, a `"use client"` component:

- Renders a plain icon button (Lucide `Bell`, sized to match the existing header's 8x8 avatar chip) with `aria-label="Notifications"`.
- Local `useState<boolean>` tracks whether the "Coming soon" popover is open.
- Clicking the bell toggles the popover; clicking anywhere else on the page (a `document` click listener while open) or clicking the bell again closes it.
- Popover content: a small rounded card anchored below the bell, `text-xs`, reading "Notifications are coming soon." — no dismiss button needed since click-away closes it.

`ParentLayout` (`src/app/parent/layout.tsx`) renders `<NotificationBell />` in the header's right-hand button group, placed before the avatar/name/logout group (bell, then avatar, then name, then logout — reading left to right as icon-only action first, identity second).

## 6. Testing

- `parent-overview.test.ts` — extend the existing attendance test (and add one more) to assert `attendanceDays` has the correct length for the month, correct `weekday` values, and correctly maps `present`/`absent`/`late`/`null` per day, including a day with no attendance record.
- New `attendance-card.test.tsx` — renders `AttendanceCard` with a small fixed set of `days` and asserts: the percent text renders, the grid has the right number of leading blank cells for a known `weekday` offset, and status colors map to the correct day cells (checked via `className` on the day cell, not by screenshot).
- New `notification-bell.test.tsx` — renders `NotificationBell`, asserts the popover is not present initially, appears after a click on the bell, and disappears after a click elsewhere in the document (simulated via `userEvent.click(document.body)` or a sibling test element) and after a second click on the bell.

## 7. Risks & Follow-ups

- **Timezone edge at month boundaries**: `monthRange()` already uses UTC month boundaries (see the original parent-login spec); `attendanceDays` reuses the same boundaries, so no new timezone risk is introduced beyond what already exists.
- **Grid size on narrow viewports**: the summary cards grid is already responsive (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`); the calendar card's internal 7-column grid needs its own min-width handling so day cells don't get too small on a 1-column mobile layout — use a fixed small cell size (e.g. `w-6 h-6` cells) rather than a fluid grid, and let the card scroll horizontally if the viewport is narrower than the grid's natural width.
- Real notification delivery/list remains explicitly deferred, per section 2.
