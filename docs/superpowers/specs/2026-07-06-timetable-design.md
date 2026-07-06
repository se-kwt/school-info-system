# Timetable — Design Spec

Status: Approved — 2026-07-06

## 1. Scope and Motivation

Attendance and Assignments are merged — Timetable is the next item on the roadmap. This sub-project covers:

1. A schema fix: give `TimetableEntry.teacherUserId` a proper FK relation to `User` (currently a bare `Int`, flagged in the original design doc's tracked follow-ups as a prerequisite before timetable features are built), make it optional (for non-teaching slots like lunch/assembly), and add a `@@unique([classId, dayOfWeek, period])` constraint.
2. Admin creating, editing, and deleting individual period entries for a class, per day of week.
3. Both Teacher and Admin viewing a class's weekly timetable.

**Explicitly out of scope:**
- An aggregated "my schedule across all my classes" view for teachers (per-class view only, matching Attendance's exact scoping).
- Live substitution / timetable-change workflows — Phase 2 per the original roadmap.
- Any school-wide "shape" config (a period template/count applied uniformly across classes). Each class's week is simply whatever `TimetableEntry` rows exist for it — period counts vary freely by day (e.g. fewer periods on Saturday) with no separate configuration concept.
- Teacher editing timetable entries — Admin only creates/edits/deletes, matching the Classes/Staff/Students admin-setup pattern rather than Attendance/Assignments' teacher-action pattern, since a timetable is static school-structure data.

## 2. Schema Changes

```prisma
model TimetableEntry {
  id            Int    @id @default(autoincrement())
  class         Class  @relation(fields: [classId], references: [id])
  classId       Int
  dayOfWeek     Int
  period        Int
  subject       String
  teacher       User?  @relation(fields: [teacherUserId], references: [id])
  teacherUserId Int?

  @@unique([classId, dayOfWeek, period])
}
```

`User` gains a back-relation: `timetableEntries TimetableEntry[]`.

- `dayOfWeek`: integers `1`–`6` for Monday–Saturday. No `0`/Sunday row.
- `period`: a plain integer the admin assigns when adding a row — not auto-incremented. Gaps are expected and fine (e.g. skipping a number for a free period isn't required to be contiguous).
- `teacherUserId` is nullable: a period can have no assigned teacher (e.g. "Lunch", "Assembly").
- The `@@unique([classId, dayOfWeek, period])` constraint prevents two entries from occupying the same slot in the same class.

This is the project's first schema change requiring a real migration — everything built for Attendance and Assignments reused models already present in Foundation's initial migration (`20260705093032_init`). This one needs a genuine `prisma migrate dev` migration, applied to the test database the same way as any schema change (`prisma migrate deploy` against `.env.test`).

## 3. Architecture

No new tables beyond the `TimetableEntry` modification above.

**Pattern consistency**, following Attendance/Assignments and Admin School Setup:
- A business-logic module (`src/lib/timetable.ts`) with testable functions, wrapped by thin API routes using `requireApiRole`.
- A single Server Component page (`/dashboard/timetable`) with role-conditional rendering (admin gets add/edit/delete controls per period; teacher gets a read-only week).
- Every read/write scoped by ownership: teacher access via `ClassTeacher` (their own classes only); admin access via `schoolId` (any class in their own school), reusing `getClassesForTeacher`/`listClasses`.
- The "assign teacher to a period" dropdown reuses the existing `listStaff(prisma, schoolId)` helper from `src/lib/school-setup/staff.ts`, filtered to `role === "teacher"` — no new teacher-listing logic needed. A period can also be left with no teacher (`teacherUserId: null`).
- No `$transaction` needed — every write (create/edit/delete) is a single-row operation, unlike Attendance/Assignments' per-student bulk writes.

## 4. Screen

**`/dashboard/timetable`** (single page, both roles):

1. **Class selector** — dropdown. Teacher: `getClassesForTeacher(prisma, claims.userId)`. Admin: `listClasses(prisma, claims.schoolId)`.
2. **Weekly view** — six columns (Mon–Sat), each listing that day's periods sorted by `period` ascending: period number, subject, teacher name (or "—" if none assigned).
3. **Admin only:** each period row has "Edit" and "Delete" actions. Each day column has an "Add Period" control (period number, subject, optional teacher select). A duplicate `(classId, dayOfWeek, period)` submission is rejected server-side with a clear error, not a raw constraint violation.
4. **Teacher:** the same weekly data, fully read-only — no add/edit/delete controls rendered.

## 5. API Contracts

### `GET /api/timetable`

Query params: `classId` (number).

Requires `requireApiRole(["teacher", "admin"])`.

- Teacher: verifies a `ClassTeacher` row exists for `(classId, teacherUserId: claims.userId)`. `403 { error: "You are not assigned to this class" }` if not.
- Admin: verifies the class exists and belongs to `claims.schoolId`. `400 { error: "The selected class does not exist" }` if not.
- `400 { error: "classId is required" }` if missing/non-numeric.
- Success `200`:
  ```
  {
    entries: Array<{
      id: number;
      dayOfWeek: number;
      period: number;
      subject: string;
      teacherUserId: number | null;
      teacherName: string | null;
    }>
  }
  ```
  Entries are returned sorted by `dayOfWeek` ascending, then `period` ascending.

### `POST /api/timetable`

Requires `requireApiRole(["admin"])`. Teacher always `403`.

Body: `{ classId: number; dayOfWeek: number; period: number; subject: string; teacherUserId?: number }`.

- `400 { error: "classId, dayOfWeek, period, and subject are required" }` if any required field is missing.
- `400 { error: "The selected class does not exist" }` if `classId` doesn't belong to `claims.schoolId`.
- `400 { error: "dayOfWeek must be between 1 and 6" }` if out of range.
- `400 { error: "The selected teacher does not exist at this school" }` if `teacherUserId` is provided but isn't a teacher at `claims.schoolId`.
- `409 { error: "A period already exists for this class, day, and period number" }` on a unique-constraint violation (caught and mapped, not surfaced raw) — matching the existing `POST /api/classes` convention for duplicate-constraint conflicts.
- Success `200 { id: number }`.

### `PATCH /api/timetable/:id`

Requires `requireApiRole(["admin"])`. Teacher always `403`.

Body: any subset of `{ subject?: string; teacherUserId?: number | null }`. `classId`, `dayOfWeek`, and `period` are never accepted — moving a period to a different slot is a delete + re-add, avoiding move-collision edge cases entirely. An **omitted** `teacherUserId` key leaves the current teacher unchanged; an **explicit** `teacherUserId: null` unsets it. "No fields to update" is based on key presence in the parsed JSON body, not on truthiness — `{ "teacherUserId": null }` counts as a field present.

- `404 { error: "Timetable entry not found" }` if the id doesn't exist or doesn't belong to the admin's school.
- `400 { error: "No fields to update" }` if the body has neither `subject` nor `teacherUserId` as a key.
- `400 { error: "The selected teacher does not exist at this school" }` if `teacherUserId` is provided (non-null) but invalid.
- Success `200 { success: true }`.

### `DELETE /api/timetable/:id`

Requires `requireApiRole(["admin"])`. Teacher always `403`.

- `404 { error: "Timetable entry not found" }` if the id doesn't exist or doesn't belong to the admin's school.
- Success `200 { success: true }`.

## 6. Testing

Following the established Vitest + real-seeded-data + `vi.hoisted` cookie-mocking pattern:

- `GET /api/timetable`: teacher's own class, teacher not assigned (`403`), admin any class in school, cross-school `classId` (`400`), missing `classId` (`400`), entries sorted by day then period, a period with no teacher returns `teacherUserId: null, teacherName: null`.
- `POST /api/timetable`: creates the entry, missing-field `400`s, cross-school `classId` (`400`), out-of-range `dayOfWeek` (`400`), invalid `teacherUserId` (`400`), duplicate `(classId, dayOfWeek, period)` rejected with `409` (verified no duplicate row created), teacher attempting `POST` (`403`), entry created with no `teacherUserId` round-trips as `null`.
- `PATCH /api/timetable/:id`: updates `subject`/`teacherUserId`, nonexistent/cross-school id (`404`), empty body (`400`), invalid `teacherUserId` (`400`), `dayOfWeek`/`period`/`classId` in body ignored (verified unchanged), teacher attempting `PATCH` (`403`).
- `DELETE /api/timetable/:id`: removes the row (verified via direct Prisma query), nonexistent/cross-school id (`404`), teacher attempting `DELETE` (`403`).
