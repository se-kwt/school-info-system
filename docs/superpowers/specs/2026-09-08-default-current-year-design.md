# Default to the current academic year everywhere

## Problem

Admin list pages that have an academic-year dimension currently default to
showing every year's data:

- `/dashboard/grades` — a "Filter by year" dropdown defaults to "All Years"
  (only affects the per-grade class-count shown, since grades themselves
  aren't year-scoped).
- `/dashboard/classes` — the same dropdown, but here it changes which Class
  rows are shown (Class is year-scoped: `Class.academicYearId`).
- `/dashboard/faculty-assignment` — no filter at all; every class from every
  year is listed with no way to narrow it.

Every other year-aware page in the app (Fees, Marks, Attendance, Students'
class-context, etc.) already hard-scopes to the active academic year
server-side with no "All Years" escape hatch, so this is not actually a
sweeping change — it's fixing the three places that are inconsistent with
the rest of the app.

## Goal

On all three pages, the current (active) academic year is what loads by
default — on first paint, not just as the dropdown's selected label. Admins
can still switch to another year from the dropdown; the option isn't
removed.

## Server-side: initial fetch matches the new default

`lib/academic-years.ts` already exports `getActiveAcademicYear(prisma,
schoolId): Promise<AcademicYear | null>` — used by all three pages:

- `apps/web/src/app/dashboard/grades/page.tsx` — resolve the active year,
  pass its `id` as `listGrades`'s existing `academicYearId` option (already
  supported, no lib change).
- `apps/web/src/app/dashboard/classes/page.tsx` — same, via `listClasses`'s
  existing `academicYearId` option (already supported).
- `apps/web/src/app/dashboard/faculty-assignment/page.tsx` — same, via
  `listClasses`'s `academicYearId` option.

If a school has no active year configured, `academicYearId` is `undefined`
and all three `list*` functions already treat that as "no filter" — same
as today's "All Years" behavior. No new fallback logic needed.

## Client-side: the dropdown's default matches

`GradesView` and `ClassesView` both already receive an `academicYears` prop
and hold a `yearFilter` string state initialized to `"all"`. Change:

- Widen the local `AcademicYearOption` interface in both files to include
  `status: "upcoming" | "active" | "archived"` (the data is already there —
  `listAcademicYears` returns it — only the local type was narrower).
- Initialize `yearFilter` by finding the entry with `status === "active"`
  and using its `id` (as a string, matching the dropdown's `value` type),
  falling back to `"all"` when none exists.

`FacultyAssignmentClassesView` has no year filter today — it renders
directly from the `initialClasses` prop with no local `classes` state or
refresh mechanism. Bring it up to the same shape as `ClassesView`:

- Add `classes` state (`useState(initialClasses)`) so a refetch can update
  what's rendered — `filteredClasses` derives from this state instead of
  from `initialClasses` directly.
- Add a `refresh(academicYearIdFilter: string)` function that calls the
  existing `GET /api/classes?academicYearId=...` endpoint (already supports
  this param; no API change) and sets `classes`.
- Add `yearFilter` state (same active-year-default logic as above) and a
  `handleYearFilterChange` that updates it and calls `refresh`.
- Add the year dropdown to its `GridToolbar` call via the existing
  `filterValue`/`onFilterChange`/`filterOptions` props (`GridToolbar`
  already supports this — `GradesView` and `ClassesView` already use it,
  no `GridToolbar` change needed).

## Out of scope

- `/dashboard/subjects` (the Grades picker for Subjects/Syllabus) — Subjects
  aren't year-scoped (`Subject` has no `academicYearId`), so there's no year
  dimension to default here.
- `/dashboard/students` — already shows the active year's class/roll context
  by design (`listStudents` resolves the active year internally) with no
  "All Years" toggle to begin with; nothing to change.
- Any other page already confirmed to hard-scope to the active year
  server-side (Fees, Marks, Attendance, Timetable, Assignments, dashboard
  overview) — unaffected, not touched.

## Testing

- `grades-view.test.tsx` / `classes-view.test.tsx`: existing `academicYears`
  test fixtures gain a `status` field (one entry `"active"`); new test
  asserting the dropdown's initial value is the active year, not "All
  Years".
- `faculty-assignment-classes-view.test.tsx`: existing tests updated for the
  new required `academicYears[].status` field; new tests for the dropdown's
  presence, default value, and that switching years triggers the expected
  `/api/classes?academicYearId=...` fetch (mocked).
