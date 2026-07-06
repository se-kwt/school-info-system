# Attendance — Design Spec

Status: Approved — 2026-07-06

## 1. Scope and Motivation

Foundation, the Web Dashboard Shell, and Admin School Setup are all merged — the system now has real schools, classes, staff, and students, but no way to record or view attendance. This is the first real classroom-facing feature (as opposed to admin data-entry), and the next step on the roadmap after School Setup.

This sub-project covers:
1. Teacher marking daily attendance (present/absent/late) for a class they teach, on a chosen date.
2. Both Teacher and Admin viewing a class's attendance for a chosen date, plus each student's attendance percentage for that month.

**Explicitly out of scope:**
- The parent-facing read API / mobile app — deferred until the mobile app sub-project actually needs it, to avoid building and maintaining an API with no consumer.
- The same-day SMS/WhatsApp absence alert from the original design — deferred to a dedicated Notifications sub-project, since alerts span multiple features (absence, fee due, new marks) and deserve one proper implementation rather than a one-off here.
- A "homeroom teacher" concept — no schema change. Any teacher with a `ClassTeacher` row for a class (regardless of subject) can mark that class's daily attendance, since `Attendance` has no subject dimension (one row per student per day).
- Admin marking or editing attendance — Admin is view-only across all classes in the school; only teachers mark.

## 2. Architecture

No database schema changes — `Attendance`, `Class`, `ClassTeacher`, and `Student` all already exist from Foundation, including the `@@unique([studentId, date])` constraint that makes re-marking a natural upsert rather than requiring new schema support.

**Pattern consistency**, following Foundation and Admin School Setup exactly:
- A business-logic module (`src/lib/attendance.ts`) with testable functions, wrapped by a thin API route (`src/app/api/attendance/route.ts`) using `requireApiRole`.
- A single Server Component page (`/dashboard/attendance`) with role-conditional rendering (teacher gets an editable form; admin gets read-only), matching the `isAdmin` conditional pattern already used on the Students page.
- Every read/write scoped by ownership: teacher access is checked via `ClassTeacher` (their own classes only); admin access is checked via `schoolId` (any class in their own school), reusing the exact `INVALID_CLASS`-style rejection pattern established in Admin School Setup for a foreign/invalid `classId`.
- Reuses Foundation's existing `getClassesForTeacher` (for the teacher's class picker) and Admin School Setup's existing `listClasses` (for the admin's class picker) — no new class-listing logic needed.

**Attendance percentage definition (a documented decision, not an assumption):** for a given student and month, `monthPercent = (count of "present" + count of "late") / (count of all marked days that month) × 100`, rounded to the nearest whole number. "Late" counts as attended-but-tardy, not absent. A student with zero marked days that month has `monthPercent = 0`.

## 3. Screen

**`/dashboard/attendance`** (single page, both roles):

1. **Class selector** — a dropdown. Teacher: populated from `getClassesForTeacher(prisma, claims.userId)`. Admin: populated from `listClasses(prisma, claims.schoolId)`.
2. **Date picker** — an `<input type="date">`, defaulting to today's date, editable to any past date.
3. **Roster table** — one row per student in the selected class, columns: Name, Status, This Month's %.
   - **Teacher:** Status is an editable `<select>` (present/absent/late), defaulting to "present" for any student with no existing record for that date. An optional per-row note field. A single "Save Attendance" button submits every row in one request.
   - **Admin:** Status renders as plain text ("Present"/"Absent"/"Late"/"—" for unmarked). No save button, no note field shown as editable.
4. Selecting a new class or date re-fetches the roster (client-side `fetch` to `GET /api/attendance`, same pattern as the create-forms' `fetch`-then-`router.refresh()` convention, adapted here to a `fetch`-then-local-state-update since this page needs to react to selector changes, not just a create-success).

## 4. API Contracts

### `GET /api/attendance`

Query params: `classId` (number), `date` (string, `YYYY-MM-DD`).

Requires `requireApiRole(["teacher", "admin"])`.

- Teacher: verifies a `ClassTeacher` row exists for `(classId, teacherUserId: claims.userId)`. If not found: `403 { error: "You are not assigned to this class" }`.
- Admin: verifies the class exists and belongs to `claims.schoolId` (via `prisma.class.findFirst({ where: { id: classId, schoolId } })`). If not found: `400 { error: "The selected class does not exist" }`.
- `400 { error: "classId and date are required" }` if either query param is missing or `classId` doesn't parse as a number.
- Success `200`:
  ```
  {
    students: Array<{
      studentId: number;
      name: string;
      status: "present" | "absent" | "late" | null;
      note: string | null;
      monthPercent: number;
    }>
  }
  ```
  `status`/`note` are `null` for a student with no `Attendance` row on that exact date. `monthPercent` is always computed per the section 2 definition, independent of whether that specific date has been marked.

### `POST /api/attendance`

Requires `requireApiRole(["teacher"])`. Admin always gets `403 { error: "Role not permitted for this resource" }` (the standard `requireApiRole` rejection) — no admin bypass.

Request body:
```
{
  classId: number;
  date: string; // YYYY-MM-DD
  entries: Array<{ studentId: number; status: "present" | "absent" | "late"; note?: string }>
}
```

- `400 { error: "classId, date, and entries are required" }` if any top-level field is missing or `entries` is empty.
- Verifies a `ClassTeacher` row exists for `(classId, teacherUserId: claims.userId)` — `403 { error: "You are not assigned to this class" }` if not.
- Verifies every `studentId` in `entries` belongs to `classId` (a single query: count of matching students must equal `entries.length`) — `400 { error: "One or more students do not belong to this class" }` if not. This guards against a crafted request attaching attendance to a student outside the teacher's own class.
- On success: upserts each entry as an `Attendance` row (`prisma.attendance.upsert` keyed on the compound unique `studentId_date`), setting `markedById: claims.userId` on every row (so a re-mark by a different teacher correctly updates who last marked it). All upserts happen in one `$transaction` — a failure partway through should not leave a half-updated roster. Returns `200 { success: true }`.

**Validation pattern:** consistent with Foundation and Admin School Setup — explicit checks before writes, specific error messages, no raw Prisma errors surfaced to the client. Given `POST` is a bulk upsert (not a single unique-constrained insert), the TOCTOU/`P2002` concern from Admin School Setup's final review doesn't apply here in the same way — `upsert` itself handles the insert-or-update race safely at the database level.

## 5. Testing

Following the established Vitest + real-seeded-data + `vi.hoisted` cookie-mocking pattern:

- `GET /api/attendance`:
  - Teacher viewing their own class with no attendance marked yet — returns all students with `status: null`, `monthPercent: 0`.
  - Teacher viewing a class they don't teach — `403`.
  - Admin viewing any class in their school — `200` with correct roster.
  - `classId` belonging to a different school — `400`.
  - Missing `date` — `400`.
- `POST /api/attendance`:
  - Fresh mark for a class+date — creates the expected `Attendance` rows, verified via a direct Prisma query.
  - Re-mark (upsert) of the same class+date with different statuses — verified the rows were updated, not duplicated (still one row per student per date, matching the unique constraint).
  - A `studentId` not belonging to `classId` — `400`, and confirms no `Attendance` rows were created for the valid students either (all-or-nothing).
  - Teacher marking a class they don't own — `403`.
  - Admin attempting to `POST` — `403`.
  - Monthly percentage calculation: seed a student with 3 "present", 1 "absent", 1 "late" marked days in a month, assert `monthPercent` computes to 80 (4 attended out of 5 marked).

## 6. Out of Scope (explicitly deferred)

- Parent-facing read API (built alongside the mobile app sub-project).
- Same-day SMS/WhatsApp absence alerts (deferred to a Notifications sub-project).
- Homeroom-teacher-only marking restriction (no schema change; any assigned teacher can mark).
- Admin marking/editing attendance (view-only for Admin).
- Editing/removing individual attendance records outside of a same-date re-mark (e.g. no "delete this record" action).
