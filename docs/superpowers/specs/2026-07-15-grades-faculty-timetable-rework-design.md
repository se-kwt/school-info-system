# Grades, Faculty Assignment & Timetable Rework — Design

Date: 2026-07-15

## Context

Today `Class` conflates "grade" and "class instance" into flat `name`/`section`
strings with no year-scoping in the model itself (year-scoping lives on join
tables like `Enrollment`, `ClassTeacher`, `TimetableEntry` via `academicYearId`).
`subject` is a free-text `String` duplicated across `ClassTeacher`,
`TimetableEntry`, `Assignment`, and `Mark`. There is no `Subject`, `Grade`, or
syllabus concept, and no distinction between "class teacher" (homeroom) and
"subject teacher." The existing timetable (`TimetableEntry`) has only a raw
`period: Int` with no notion of clock time.

This rework introduces:
1. Reusable **Grade templates** (e.g. "Grade 1") with subjects and versioned
   syllabus, assignable to multiple year-specific class instances (e.g.
   "2026 Grade 1 A", "2026 Grade 1 B").
2. Per-class **faculty assignment** per subject, with a class teacher chosen
   from among a class's assigned subject teachers, and support for
   reassignment.
3. A **timetable** with global period time intervals, per-day time overrides,
   and a week/day calendar view toggle.

## 1. Data model

### New models

```prisma
model Grade {
  id       Int      @id @default(autoincrement())
  school   School   @relation(fields: [schoolId], references: [id])
  schoolId Int
  name     String                    // e.g. "Grade 1"
  subjects Subject[]
  classes  Class[]
  @@unique([schoolId, name])
}

model Subject {
  id               Int      @id @default(autoincrement())
  grade            Grade    @relation(fields: [gradeId], references: [id])
  gradeId          Int
  name             String                  // e.g. "Mathematics"
  versions         SyllabusVersion[]
  classTeachers    ClassTeacher[]
  timetableEntries TimetableEntry[]
  assignments      Assignment[]
  marks            Mark[]
  @@unique([gradeId, name])
}

model SyllabusVersion {
  id          Int      @id @default(autoincrement())
  subject     Subject  @relation(fields: [subjectId], references: [id])
  subjectId   Int
  versionNum  Int                    // auto-incremented per subject: v1, v2, v3...
  title       String
  content     String                 // rich/plain text
  fileUrl     String?
  fileName    String?
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdById Int
  createdAt   DateTime @default(now())
  @@unique([subjectId, versionNum])
}

model Period {
  id         Int    @id @default(autoincrement())
  school     School @relation(fields: [schoolId], references: [id])
  schoolId   Int
  order      Int                     // 1, 2, 3... display/sort order
  label      String                  // e.g. "Period 1", "Break"
  isBreak    Boolean @default(false) // breaks are non-schedulable slots
  startTime  String                  // "09:00", global default
  endTime    String                  // "09:45", global default
  overrides  PeriodDayOverride[]
  timetableEntries TimetableEntry[]
  @@unique([schoolId, order])
}

model PeriodDayOverride {
  id        Int    @id @default(autoincrement())
  period    Period @relation(fields: [periodId], references: [id])
  periodId  Int
  dayOfWeek Int                      // 0=Sun..6=Sat
  startTime String
  endTime   String
  @@unique([periodId, dayOfWeek])
}
```

### Modified models

- `Class`: replace flat `name` with `gradeId` (FK to `Grade`) + keep
  `section`; add `academicYearId` (FK, required) so a `Class` row *is* a
  year-specific instance. Uniqueness: `@@unique([gradeId, section,
  academicYearId])`.
- `ClassTeacher`: `subject: String` → `subjectId: Int` (FK to `Subject`).
  Add `isClassTeacher: Boolean @default(false)`. A class teacher is a
  `ClassTeacher` row (tied to one of its subjects) with this flag set true.
  Enforced at the application layer: at most one `isClassTeacher: true` per
  `(classId, academicYearId)`.
- `TimetableEntry`: `subject: String` → `subjectId: Int`; `period: Int` →
  `periodId: Int` (FK to `Period`).
- `Assignment`, `Mark`: `subject: String` → `subjectId: Int`.

## 2. Faculty assignment & reassignment flow

- On a `Class` instance's detail page, admin sees a table of the `Grade`'s
  subjects. For each subject, admin can assign one or more teachers
  (add/remove `ClassTeacher` rows) — multiple teachers per subject is
  allowed.
- **Reassignment** is editing that table: removing a teacher's
  `ClassTeacher` row and adding a new one. No approval workflow; each row
  keeps its own `id`/implicit creation order for basic traceability. No
  dedicated audit log.
- **Class teacher** picker: a dropdown scoped to `User`s who already have a
  `ClassTeacher` row for that class (any subject). Selecting one sets
  `isClassTeacher = true` on their row and clears it on any previous holder
  in the same transaction.
- Admin-only (matches existing `ClassesView` pattern). Teachers get a
  read-only view of their own assignments.

## 3. Timetable structure

- Every day of the week uses the same ordered list of `Period`s (same count
  and order across days). A day's actual clock time for a period is looked
  up from `PeriodDayOverride` for that `(periodId, dayOfWeek)` if one
  exists, else falls back to the `Period`'s global `startTime`/`endTime`.
- Slot-filling UI (day + period → subject → teacher): subject options come
  from the class's `Grade` subjects; teacher options are restricted to that
  subject's assigned `ClassTeacher`s for the class.
- Admin manages `Period`/`PeriodDayOverride` school-wide (one schedule
  shared across all grades/classes). Teachers/parents view only.

## 4. Timetable calendar UI (week/day view toggle)

- Recurring weekly grid, not tied to real calendar dates.
- **Week view** (default): all days as columns, periods as rows, each cell
  shows subject + teacher initials. Close to today's `TimetableView.tsx`
  grid.
- **Day view**: single day selected (tab/dropdown), showing that day's
  periods as a vertical list with full subject/teacher/time detail, plus
  prev/next-day navigation.
- Toggle control (Week/Day) above the grid; clicking a day column header in
  week view can jump into day view for that day.
- Break periods (`isBreak: true`) render as a visually distinct,
  non-editable row spanning all days.

## 5. Data migration

One-time Prisma migration + backfill script run at deploy:

1. For each distinct `Class.name` per school → create a `Grade` row.
2. For each distinct `subject` string scoped to a `Grade` (scanned from
   `ClassTeacher`, `TimetableEntry`, `Assignment`, `Mark` on classes under
   that grade) → create a `Subject` row. Each gets one initial
   `SyllabusVersion` (v1, empty content) so nothing is orphaned.
3. Relink `Class`: set `gradeId` from step 1. Since existing `Class` rows
   aren't currently year-scoped, for each existing `Class`, find every
   distinct `academicYearId` referenced by its `Enrollment`s,
   `ClassTeacher`s, `TimetableEntry`s, and `Assignment`s, and create one new
   year-scoped `Class` row per such year. Relink each of those records to
   the matching year's new `Class` instance. This preserves history for
   schools that reused a class name across multiple years.
4. Swap `ClassTeacher.subject`, `TimetableEntry.subject`,
   `Assignment.subject`, `Mark.subject` (string) for the matched
   `Subject.id` (FK column).
5. Drop old string columns after verification.

## 6. API & testing scope

- New CRUD routes: `/api/grades`, `/api/subjects` (nested under grade),
  `/api/subjects/[id]/syllabus-versions`, `/api/periods`,
  `/api/periods/[id]/overrides`.
- Existing routes (`/api/classes`, `/api/timetable`, `/api/assignments`,
  exam/marks routes) updated for the new FKs.
- `lib/school-setup/classes.ts` and `lib/timetable.ts` extended/refactored
  in place, following existing patterns (delete-guards, archive support)
  extended to `Grade`/`Subject`/`Period` — e.g. a `Subject` can't be deleted
  while it has `ClassTeacher`/`TimetableEntry`/`Assignment`/`Mark` rows.
- Vitest coverage: unit tests for new `lib` functions, API route tests
  mirroring the existing `timetable-api.test.ts` style, and a migration
  correctness check for the backfill script.

## Permissions

Admin manages Grades, Subjects, syllabus versions, faculty assignment,
class teacher selection, and Period/timetable structure. Teachers and
parents get read-only views scoped to their own classes/children.

## Out of scope

- Syllabus versions are a free-running revision history, not tied to
  academic year.
- No dedicated audit log for faculty reassignment history beyond row
  creation order.
- No real-date calendar (holidays/exceptions) for the timetable — purely a
  recurring weekly pattern.
- Per-day period count/order differences (e.g. Saturday having fewer
  periods) — all days share the same period list; only clock times vary.
