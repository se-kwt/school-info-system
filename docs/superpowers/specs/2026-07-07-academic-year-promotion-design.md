# Academic Year Management & Promotion Wizard — Design Spec

Status: Approved — 2026-07-07

## 1. Scope and Motivation

Every module built so far (Attendance, Assignments, Timetable, Marks, Fees) implicitly assumes "current state" — there is no `AcademicYear` concept anywhere in the schema. `Class` is a bare `(school, name, section)` row and `Student.classId` is a single direct foreign key, not a per-year enrollment. Before this system can survive a real school's year-end rollover, that gap has to be closed.

This sub-project covers:

1. Introducing `AcademicYear` as the organizing concept every year-scoped record hangs off of.
2. Replacing `Student.classId` with a proper per-year `Enrollment` (student × class × academic year × status).
3. An admin-only **Promotion Wizard**: create the new academic year, map each class to its next-year target, review/override each student's outcome (promote / retain / graduate / transfer / leave / inactive), confirm, and execute — with a full audit log and a time-limited undo.
4. Archiving: once a year is promoted past, it becomes read-only; all other modules gain year-scoping so historical data survives untouched.

No real school has gone live on the system yet, so this is a clean schema redesign, not a production migration — every existing seed/test fixture is updated to the new shape as part of this work, with no backward-compatibility shims.

**Explicitly out of scope:**
- Online/automatic fee carry-forward logic between years (fee structures are simply re-created per year by the admin, same as today).
- Notifications tied to promotion (deferred along with the rest of the Notifications module).
- Per-student manual mid-year class transfer UI — that's a normal student-edit action outside the wizard; the wizard only handles the year-end batch transition. (An `Enrollment.status` change made mid-year via that action is simply respected as already-decided when the wizard runs.)
- Configurable/persistent grade ordering — the wizard always requires the admin to pick or confirm the class mapping each run, with a best-guess pre-fill; there's no separate "grade level" setup screen.

## 2. Schema Changes

```prisma
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
  id               Int                 @id @default(autoincrement())
  school           School              @relation(fields: [schoolId], references: [id])
  schoolId         Int
  fromAcademicYear AcademicYear        @relation("FromYear", fields: [fromAcademicYearId], references: [id])
  fromAcademicYearId Int
  toAcademicYear   AcademicYear        @relation("ToYear", fields: [toAcademicYearId], references: [id])
  toAcademicYearId Int
  initiatedBy      User                @relation(fields: [initiatedById], references: [id])
  initiatedById    Int
  status           PromotionRunStatus  @default(draft)
  createdAt        DateTime            @default(now())
  confirmedAt      DateTime?

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

**Changed models:**

- `Class`: no schema change — it persists across years. Gains reverse relations to `Enrollment`, `PromotionMapping` (as both `MappingFrom`/`MappingTo`).
- `Student`: **remove** `classId` and `section`. **Add** `status StudentStatus @default(active)`. Current class/section is derived by joining to the `Enrollment` row for the active `AcademicYear`.
- `ClassTeacher`: add `academicYear`/`academicYearId`; unique constraint becomes `@@unique([classId, teacherUserId, subject, academicYearId])`.
- `TimetableEntry`: add `academicYear`/`academicYearId`; unique constraint becomes `@@unique([classId, dayOfWeek, period, academicYearId])`.
- `FeeStructure`: add `academicYear`/`academicYearId`.
- `Exam`: add `academicYear`/`academicYearId`.
- `Assignment`: add `academicYear`/`academicYearId`.
- `Attendance`: **no schema change** — a student's `date` already unambiguously falls within exactly one `AcademicYear`'s `[startDate, endDate]` range, so the year is derived rather than stored redundantly.

## 3. Architecture

**`src/lib/academic-years.ts`**:
- `listAcademicYears(prisma, schoolId)` — all years for a school, most recent first.
- `getActiveAcademicYear(prisma, schoolId)` — the single `status: "active"` year; every other module's default scope.
- `createAcademicYear(prisma, schoolId, input)` — creates with `status: "upcoming"`. Validates `startDate < endDate` and that the name is unique per school.

**`src/lib/promotion.ts`** — the wizard's engine, mirroring the multi-step-but-single-module shape of `src/lib/fee-payments.ts`:
- `startOrResumePromotionRun(prisma, schoolId, initiatedById, toAcademicYearId)` — returns the existing `draft` run for the school if one exists (enforces the one-draft-per-school rule), else creates one alongside auto-generated `PromotionMapping` rows (one per class with any `active` enrollment in the current year, `toClassId` pre-filled by a same-name-different-section-aware best guess, else `null`).
- `updateMappings(prisma, runId, mappings: { fromClassId, toClassId | null }[])` — overwrites mapping rows for the run.
- `getRosterForReview(prisma, runId)` — per source class, every enrolled student with a computed default decision (`promoted` if mapped, else forces an explicit per-student decision) and any existing override.
- `setStudentDecisions(prisma, runId, decisions: { studentId, action, toClassId? }[])` — bulk + individual override writes, stored transiently on the run (a lightweight `PromotionMapping`-adjacent staging table is unnecessary — decisions are held as `PromotionLogEntry` rows with the run still in `draft`, doubling as both the staging area and the eventual audit log).
- `getRunSummary(prisma, runId)` — aggregate counts by action, grouped by source class, plus a list of any enrolled student with no decision yet (blocks confirm).
- `confirmPromotionRun(prisma, runId)` — validates every enrolled student has a decision, then in one `$transaction`: flips `fromAcademicYear.status → archived`, `toAcademicYear.status → active`, creates new-year `Enrollment` rows for `promoted`/`retained` students, sets old-year `Enrollment.status` and `Student.status` per each `PromotionLogEntry.action`, sets `PromotionRun.status = "confirmed"` and `confirmedAt`.
- `revertPromotionRun(prisma, runId)` — only allowed while `toAcademicYear` has zero rows across `Attendance` (by date range), `Mark`/`Exam`, `FeePayment`/`FeeStructure`, `TimetableEntry`, `ClassTeacher`, or `Assignment` scoped to it. Reverses the transaction: deletes the new-year `Enrollment` rows, restores old-year `Enrollment.status`/`Student.status` to their pre-run values (recoverable from the `PromotionLogEntry` since it records the action taken, and the old status was always `active` beforehand — enrollments aren't overridden more than once per run), flips the years back, sets `PromotionRun.status = "reverted"`.

**Year-scoping guard** — a small shared helper `assertYearIsWritable(academicYear)` throws if `status !== "active"`, called at the top of every mutating handler in `attendance.ts`, `marks.ts` (via `exams.ts`), `fee-payments.ts`/`fee-structures.ts`, `timetable.ts`, `assignments.ts`, and the `ClassTeacher` admin-setup path. Every read path in those same modules accepts an optional `academicYearId`, defaulting to the active year.

`requireApiRole`/`requireDashboardRole` restrict `/dashboard/academic-years` and the wizard entirely to `["admin"]` — this is a structural operation, not a day-to-day one, so no accountant/teacher access at all.

## 4. Promotion Wizard Screen Flow

**`/dashboard/academic-years`** — list of years (name, dates, status badge), "Start New Academic Year" action visible only when no `draft` `PromotionRun` exists and no `upcoming` year is already sitting unused.

**`/dashboard/academic-years/promote`** (wizard, one page with sequential sections, matching the single-Server-Component-page pattern used by Fees/Timetable):

1. **New year details** — name, start date, end date. Creates the `upcoming` `AcademicYear` and a `draft` `PromotionRun` on submit.
2. **Class mapping** — table of source classes → target-class dropdown (pre-filled guess, editable, or "No mapping / all students reviewed individually").
3. **Roster review** — per class, a table of students defaulting to "Promote," with a per-row action selector (Promote / Retain / Graduate / Transfer / Left / Inactive) and bulk "set all in this class to Promote/Retain" actions. Any student without a mapped target class is forced to pick a non-promote action.
4. **Summary & confirm** — counts by action across the whole run, blocked with an inline error listing any student still without a decision. "Confirm Promotion" executes step-4 from §3.
5. **Post-confirm banner** — "Promotion complete. [Undo]" — the undo button is present and functional only while the new year is still empty of other activity (per the `revertPromotionRun` guard); once other data exists, the banner simply stops offering it on next page load.

**Concurrency rule:** only one `draft` `PromotionRun` may exist per school; requesting the wizard while one exists resumes it instead of creating a second.

## 5. API Contracts

### `GET /api/academic-years`
`requireApiRole(["admin", "teacher", "accountant"])` (read-only, needed by every module's year-switcher). Returns `{ academicYears: Array<{ id, name, startDate, endDate, status }> }`, scoped to `claims.schoolId`.

### `POST /api/academic-years`
`requireApiRole(["admin"])`. Body `{ name, startDate, endDate }`.
- `400 { error: "name, startDate, and endDate are required" }`
- `400 { error: "startDate must be before endDate" }`
- `400 { error: "An academic year with this name already exists" }` (schoolId-scoped unique violation)
- Success `200 { id }`.

### `POST /api/promotion-runs`
`requireApiRole(["admin"])`. Body `{ toAcademicYearId }`. Creates or resumes the school's draft run + auto-mappings. Returns `200 { id, mappings: [...] }`.

### `PUT /api/promotion-runs/:id/mappings`
Body `{ mappings: [{ fromClassId, toClassId | null }] }`. `400` if run isn't `draft` or doesn't belong to `claims.schoolId`. Success `200 { ok: true }`.

### `GET /api/promotion-runs/:id/roster`
Returns per-class roster with current decisions, per §3. `400` for cross-school run id.

### `PUT /api/promotion-runs/:id/decisions`
Body `{ decisions: [{ studentId, action, toClassId? }] }`. `400 { error: "toClassId is required when action is \"promoted\"" }` if a `promoted` decision has no target class (either from mapping or explicit override). Success `200 { ok: true }`.

### `GET /api/promotion-runs/:id/summary`
Returns `{ counts: Record<action, number>, byClass: [...], undecidedStudentIds: number[] }`.

### `POST /api/promotion-runs/:id/confirm`
`400 { error: "All students must have a decision before confirming" }` if `undecidedStudentIds` is non-empty. Success `200 { ok: true }` — executes §3's transaction.

### `POST /api/promotion-runs/:id/revert`
`400 { error: "This promotion can no longer be undone — the new year already has data recorded against it" }` if the new year has any activity. Success `200 { ok: true }`.

### Existing endpoints
`GET`/mutating endpoints in `attendance.ts`, `marks.ts`/`exams.ts`, `fee-structures.ts`/`fee-payments.ts`, `timetable.ts`, `assignments.ts`, and `ClassTeacher` admin-setup all gain an optional `academicYearId` query/body param (default: active year) and return `400 { error: "This academic year is archived and no longer accepts changes" }` on any write attempt against a non-active year.

## 6. Testing

Left to the implementation plan, per usual Vitest + real-seeded-data pattern established by prior modules.
