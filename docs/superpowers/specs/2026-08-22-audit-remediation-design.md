# Audit Remediation — Design

Date: 2026-08-22

## Context

The data-model and flow audit published as *The Broken Seam* (21 Aug 2026)
assessed the schema, 50 API routes and 90 pages/components against the
`changeweb/Unifiedtransform` benchmark. It returned 4 Critical, 8 High, 17
Medium and 9 Low findings, plus 4 stub pages.

Its central conclusion: the static skeleton is sound. `Grade → Subject →
SyllabusVersion` and `Class → Grade` are enforced at both the database and the
service layer, RBAC is correct across all 50 routes, and parent scoping is
genuinely safe. The failures cluster on **one seam** — where the year-agnostic
template layer (`Grade`, `Subject`, `SyllabusVersion`, which carry no
`academicYearId`) meets the year-scoped instance layer (`Class`, `ClassTeacher`,
`Enrollment`, `TimetableEntry`, which all do). Four code paths write a
year-scoped row while trusting an unvalidated client-supplied ID, and each
produces silently corrupt data rather than an error.

This document specifies the remediation as eight phases. Each phase is a
coherent vertical slice — its migration, its service changes, its UI and its
tests — and each leaves the system strictly more correct on its own.

### Verification against the working tree

The audit was written against branch `claude/field-gaps-flow-analysis-659842`.
Every Critical and High reference was re-checked against the current tree before
this spec was written, and all hold:

| Finding | Reference | Confirmed |
|---|---|---|
| C1 | `src/lib/assignments.ts:201` — bare `data.subjectId` assignment, no subject query in the function | yes |
| C2 | `src/lib/promotion.ts:119` — `data: { toClassId }` written unvalidated | yes |
| C3 | `src/lib/school-setup/students.ts:191`, `:340` — `findFirst({ where: { id, schoolId } })`, no year | yes |
| C4 | `prisma/schema.prisma:411` — `@@unique([studentId, feeStructureId])` | yes |
| H1 | `src/lib/academic-years.ts:78` — `status: "upcoming"` hardcoded | yes |
| H2 | `prisma/schema.prisma:443` — no partial unique index on `status` | yes |
| H3 | `src/lib/promotion.ts:433-435, 453, 465-466` | yes |
| H4 | `src/lib/timetable.ts` — `periodId` is passed through at `:98`/`:111`, never queried | yes |
| H7 | `src/lib/exams.ts:10` — `listExams(prisma, schoolId)`, no year parameter | yes |
| H8 | 5 `createdAt` columns across 27 models, zero `updatedAt` | yes |

### Two corrections to the audit

1. **C2 has a second write path the audit missed.** `updateMappings`
   (`promotion.ts:119`) is not the only place an unvalidated `toClassId` is
   persisted. `applyDecisions` accepts `decision.toClassId` from the client and
   at `promotion.ts:245` resolves `toClassId = decision.toClassId ??
   mapping?.toClassId ?? null` with no lookup either. A fix confined to
   `updateMappings` leaves the hole open. Phase 1 covers both.

2. **`FeePayment.amountPaid` is `Float`** (`schema.prisma:405`). The audit
   observed the symptom — "possible float tails" — in its front-end formatting
   section and treated it as a display defect. It is a storage defect: money is
   held in binary floating point, so instalment sums do not reconcile exactly.
   This belongs to the C4 ledger rework (Phase 5), not the formatting cleanup.

### Scope decisions taken before writing

- **In scope:** every Critical, High, Medium and Low finding — data-integrity
  bugs, the academic-year lifecycle, schema and enum gaps, index gaps, and the
  front-end defects.
- **No live data.** All environments are dev/seed only. Migrations may add
  required columns, drop constraints, and assume `prisma migrate reset` is
  available. No backfill scripts, no expand/contract, no dual-write.
- **Stub pages:** `reports` and `resources` are de-linked from navigation rather
  than built — they are net-new product modules, not remediation. `notifications`
  is built properly, because `type` and `relatedId` are already stored and
  ignored. Teacher and accountant get a real minimal settings page.
- **Deferred** (see [Deferred decisions](#deferred-decisions)): the Term model,
  year-scoping subjects and syllabus, a configurable grading scale, parent
  timetable/syllabus pages, and the browse-a-past-year session switch.

## Architecture

### Why phases are domain slices, not severity tiers

The two precedent plans (`2026-08-16-critical-security-fixes`,
`2026-08-16-phase2-high-severity-fixes`) grouped work by severity. That worked
when the findings were a homogeneous set of security defects. It works badly
here, because the Medium findings are not a tier — each one attaches to a domain
that a High finding already forces open.

`Exam.maxMarks`/`passMarks`/`published` (Medium), `Mark.academicYearId`/
`isAbsent` (Medium), marks-within-max client validation (Medium) and the
`Exam.examDate` index (Medium) all live in the same two files and the same test
file as H7's exam year-scoping. Grouping by severity means opening
`src/lib/marks.ts` in three separate phases and writing three overlapping test
suites against it.

The one place severity ordering is kept is **Phase 1**, which is exactly the
audit's own "first" bucket: the pure-code fixes that close every unvalidated-ID
write. It carries no migration, depends on nothing, and can land immediately —
C1 and C2 are cross-tenant writes and should not wait behind a schema change.

### Phase dependency graph

```
                 Phase 1  ── unvalidated writes, no migration, no deps
                    │        lands first: C1/C2 are cross-tenant writes
                    ▼
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
     Phase 2     Phase 3     Phase 4     Phase 5      ← mutually independent
   year cycle   attendance   exams &      fees
                 & revert     marks      ledger
                    │
                    ▼
                 Phase 6  ── rollover & faculty  (hard dep on 3)
                    │
                    ▼
                 Phase 7a ── schema, enums, timestamps
                    │            └─▶ unblocks grade inference back in Phase 1's
                    ▼                 toClassId check
                 Phase 7b ── forms & views
                    │
                    ▼
                 Phase 8  ── front-end defects & stub cleanup
```

Phases 2, 3, 4 and 5 are mutually independent and may be reordered or
parallelised. Phase 8 is listed last because it is the lowest-severity work, not
because anything blocks it — its only real coupling is that money formatting
already left it for Phase 5.

Only two edges are hard:

- **3 → 6.** Rollover (H6) extends `confirmPromotionRun`, whose revert
  counterpart is corrected in Phase 3. Building rollover on the over-broad
  delete means writing clone logic against a revert that will discard rows the
  clone created.
- **7 → promotion grade inference.** `Grade.sortOrder` arrives in Phase 7a.
  Until then, Phase 1's grade-progression assertion on `toClassId` can only
  *reject* a wrong mapping, not *suggest* the right one. This is stated as a
  known limitation of Phase 1, not a defect.

### Conventions every phase inherits

Carried forward from the existing codebase and the two precedent plans:

- Service functions return discriminated-union `Result` types
  (`{ ok: true, ... } | { ok: false, error: "CODE" }`). New error codes are
  **additive** — never change the shape of an existing `ok: false` branch that
  callers already match on.
- Multi-step writes go through `prisma.$transaction`.
- Tests are real-Postgres integration tests under `apps/web/tests/`, using
  `resetDb()` + `prisma` from `./helpers/db`, with `fileParallelism: false`.
- Every phase must keep `npx tsc --noEmit` and `npm run build` clean inside
  `apps/web/`, and keep all previously-passing tests green.
- Each finding gets a **failing test first**, then the fix. A phase is not done
  until every finding it claims has a test that fails without the fix.
- No phase fixes findings outside its own scope.

---

## Phase 1 — Close the unvalidated writes

**Findings:** C1, C2 (both write paths), C3, H4, H5, and the inactive-teacher
gap from the hop table.

**Migration:** none.

Every defect here is the same shape: a client-supplied foreign key reaches a
database write without a lookup that constrains it to the caller's tenant, year
or grade. The fix is the same shape too — resolve the ID with a `findFirst`
carrying the full constraint set, and return a new error code on miss.

### 1.1 — C1: `editAssignment` re-runs the create-path checks

`createAssignment` requires a matching `ClassTeacher` row before accepting a
subject. `editAssignment` performs no subject lookup at all: `assignments.ts:201`
assigns `data.subjectId = params.fields.subjectId` and the route forwards the
body untouched, so the only surviving check is the foreign key's existence
constraint — satisfied by any subject row in the database, including another
school's.

Fix: when `fields.subjectId` is present, resolve the subject against
`assignment.class.gradeId` and require a `ClassTeacher` row for the editing
teacher, exactly as `createAssignment` does. Extract the shared check into one
function called by both paths so they cannot drift again.

Also in scope: assignment **status** updates currently verify that the teacher
teaches *something* in the class, not that they teach *that subject*. Tighten to
the subject.

- Files: `src/lib/assignments.ts:170-210`, `src/app/api/assignments/[id]/route.ts:41`
- New error: `INVALID_SUBJECT`
- Test: PATCH with another school's `subjectId` is rejected; PATCH with a
  same-school subject outside the class's grade is rejected; PATCH with a valid
  subject the teacher is not assigned is rejected.

### 1.2 — C2: validate `toClassId` on both promotion write paths

Neither `updateMappings` nor `applyDecisions` checks the target class. Validate
every `toClassId` against `{ schoolId, academicYearId: run.toAcademicYearId }`
before persisting, in both functions.

Grade progression is asserted as a **warning-free hard check only where it can
be**: with no `Grade.sortOrder` until Phase 7, the check is limited to "target
class's grade belongs to the same school" plus "target class is not archived".
Full next-grade inference is a Phase 7 follow-up, noted in the plan.

- Files: `src/lib/promotion.ts:88-125` (`updateMappings`), `:208-280`
  (`applyDecisions`), `src/app/api/promotion-runs/[id]/mappings/route.ts:24`
- New error: `INVALID_TARGET_CLASS`
- Test: School A admin sending a School B `toClassId` is rejected on both
  endpoints; a `toClassId` in the wrong academic year is rejected; an archived
  target class is rejected; confirm-after-reject leaves no cross-school
  `Enrollment`.

### 1.3 — C3: year-scope the class lookup on student create and edit

`createStudent` takes `academicYearId` from the server (always the active year)
but `classId` from the client, and validates the class against the school only
(`students.ts:191`). `editStudent` repeats the omission at `:340`. A mismatched
enrollment is written successfully and then matches nothing: every downstream
roster query filters on `classId` **and** `academicYearId` together, so the
student appears on no attendance sheet, marks roster, fee roster or assignment
list, with no error raised.

Fix: add `academicYearId` to both `findFirst` filters and return `INVALID_CLASS`
on mismatch.

- Files: `src/lib/school-setup/students.ts:191`, `:339-344`
- Test: creating a student against a prior-year class is rejected; the student
  and the enrollment are both absent afterwards; the same for `editStudent`
  reassigning a class.

### 1.4 — H4: school-scope `periodId` in both timetable write paths

`createTimetableEntry` validates the class, the day range, the subject against
the class's grade, the teacher against a `ClassTeacher` row, and double-booking.
It never resolves `periodId` — the value is passed straight into the write at
`timetable.ts:98` and `:111`. The foreign key alone carries no school context.

Fix: resolve with `findFirst({ where: { id: periodId, schoolId } })` and reject
on miss. Reject `isBreak` periods while there. Apply the same school scoping to
the double-booking clash query, which currently filters by `periodId` alone.

- Files: `src/lib/timetable.ts:67-110` and the edit path
- New errors: `INVALID_PERIOD`, `BREAK_PERIOD`
- Test: another school's `periodId` is rejected on create and on edit; a break
  period is rejected; two schools using periods with the same ID range do not
  produce a false double-booking clash.

### 1.5 — H5: filter the timetable subject dropdown by grade

The page passes `listAllSubjects(prisma, claims.schoolId)` — every subject in
the school — into `TimetableView`, which renders them unfiltered. The
component's own `SubjectOption` type already carries `gradeId`; it is never
used. An admin building a Grade 10 timetable is offered Grade 1 subjects, and
the (correct) server-side check rejects the choice only after submission.

Fix: filter by the selected class's `gradeId`, mirroring `AssignmentsView.tsx:73`.

- Files: `src/components/timetable/TimetableView.tsx:7, 215, 259`,
  `src/app/dashboard/timetable/page.tsx:18`
- Test: component test asserting only the selected class's grade's subjects render.

### 1.6 — Inactive teachers cannot be assigned

`class-teachers.ts:55` checks role and school but not `status`. Deactivated
teachers are offered by the UI dropdown (built from all staff with
`role === "teacher"`) and accepted by the service.

Fix both layers: add `status: "active"` to the service check with a new
`TEACHER_INACTIVE` error, and filter the dropdown.

**Phase 1 exit criteria:** all six findings have red-then-green tests; no
migration was written; `tsc --noEmit` and `npm run build` clean; no cross-tenant
write remains reachable through any documented repro in the audit.

---

## Phase 2 — Academic-year lifecycle

**Findings:** H1, H2, promotion-into-archived-year, fee-structure year scoping.

**Migration:** one partial unique index.

### 2.1 — H2: at most one active year per school

`AcademicYear` carries `@@unique([schoolId, name])` and nothing else.
`getActiveAcademicYear` (`academic-years.ts:7`) resolves with `findFirst`, which
on a tie returns whichever row Postgres yields first — so two active years mean
different requests silently resolve to different years, with attendance written
against one and marks against another.

```sql
CREATE UNIQUE INDEX "AcademicYear_schoolId_active_key"
  ON "AcademicYear"("schoolId") WHERE status = 'active';
```

Prisma 5.20 cannot express a partial index in the schema DSL, so this ships as
raw SQL inside a generated migration, with the schema annotated by comment.

### 2.2 — H1: an activation path

`createAcademicYear` hardcodes `status: "upcoming"` (`academic-years.ts:78`) and
the API exposes only `GET` and `POST`. The only code that ever sets a year
`active` is inside promotion confirm and revert. The seeded demo school works
because `prisma/fixtures.ts:12` writes an active year directly — which is why
this has never surfaced. A real school onboarded without fixtures has no active
year and no route to create one, and every operational page degrades silently
through `activeYear?.id ?? -1`.

Add `PATCH /api/academic-years/[id]` supporting two transitions:

- `activate` — `upcoming → active`, in a transaction that archives the current
  active year in the same statement, so the partial unique index is never
  transiently violated.
- `archive` — `active → archived`, refused if it would leave the school with no
  active year.

Admin-only, with UI controls on the academic years view.

### 2.3 — Promotion cannot target an archived year

`toYear.status` is never checked. Assert the target year is `upcoming` when a
promotion run is drafted.

### 2.4 — Fee structures are year-scoped

Fee structures are neither year-validated on create nor year-filtered on list.
Add both, matching the pattern used elsewhere in `lib/school-setup/`.

**Phase 2 exit criteria:** a second active year cannot be created by any path,
including concurrently; a fresh school with no fixtures can reach an active year
entirely through the UI; a promotion cannot target an archived year;
`getActiveAcademicYear` is deterministic by construction.

---

## Phase 3 — Attendance and revert correctness

**Findings:** H3 (three distinct defects), `AttendanceStatus` widening, admin
date bounds, the attendance note UI, the `Attendance.date` index.

**Migration:** `Attendance.academicYearId` (required), `Attendance.date` index,
`AttendanceStatus` enum values.

### 3.1 — `Attendance.academicYearId`

The root cause of H3's first defect. `Attendance` (`schema.prisma:275-287`) has
`studentId`, `date`, `status`, `markedById`, `note` — and no year column, so
the revert guard cannot filter by year and falls back to a bare date range.

Add the column as required, with an index, and populate it at write time from
the student's enrollment. No backfill is needed (dev/seed data only).

### 3.2 — H3: three defects in `revertPromotionRun`

1. **Unscoped activity check.** Five of six guard counts filter by
   `academicYearId`; the sixth counts `Attendance` by bare date range with no
   school, class or student filter. Since every school's academic year spans
   roughly the same months, one school's attendance permanently blocks another
   school's revert. Fixed by 3.1 — filter on `academicYearId`.
2. **Over-broad delete.** `tx.enrollment.deleteMany({ where: { academicYearId:
   run.toAcademicYearId } })` (`promotion.ts:453`) is scoped to the year but not
   the run, so reverting one run deletes every enrollment in the target year —
   including students enrolled manually or by a different run. Scope the delete
   by the run's `PromotionLogEntry` rows.
3. **Blind reactivation.** The source year is set back to `active`
   (`promotion.ts:465-466`) with no check that another year is already active —
   exactly the condition H2 leaves unguarded. Add an explicit pre-check
   returning a typed error, and perform the archive-and-activate in one
   transaction. This fix stands on its own and does not require Phase 2; if
   Phase 2 has already landed, its partial index is a database-level backstop
   behind the same check, and the transaction shape here must match 2.2's so the
   index is never transiently violated.

### 3.3 — Widen `AttendanceStatus`

`present · absent · late` cannot express a half day, an excused absence or a
holiday, so every percentage in the app counts `late` as fully present and
everything else as fully absent — medical leave is indistinguishable from
truancy. Add `half_day`, `excused`, `holiday`, and update the percentage
computation in `src/lib/attendance-status.ts` and the dashboard aggregates to
weight them correctly. `excused` and `holiday` are excluded from the denominator;
`half_day` counts 0.5.

### 3.4 — Admin date bounds and the note UI

Teachers are correctly locked to today. Admins have no date bounds at all — any
past or future date, inside or outside the year. Constrain admin marking to
dates within the active year's `startDate`/`endDate`.

`Attendance.note` is stored and surfaced in the parent-facing design but has no
UI to enter or read one. Add both.

**Phase 3 exit criteria:** another school's attendance never blocks a revert;
reverting one run leaves other runs' and manual enrollments intact; reactivation
into an occupied active slot returns a typed error rather than throwing;
attendance percentages treat excused absence and holidays correctly.

---

## Phase 4 — Exams, marks and publication

**Findings:** H7, `Exam.maxMarks`/`passMarks`/`weightage`/`published`,
`Mark.academicYearId`/`gradePoint`/`remarks`/`isAbsent`/`enteredBy`/`enteredAt`,
marks-within-max client validation, the `Exam.examDate` index.

**Migration:** yes.

### 4.1 — H7: year-scope exams and marks

`listExams(prisma, schoolId)` (`exams.ts:10`) takes no year parameter, so
`GET /api/exams` returns every exam the school has ever created, from every
year, with no year field in the response. Neither `getMarksForClassExam` nor
`enterMarks` compares `exam.academicYearId` against the active year — only
`schoolId`. A teacher can pick a two-year-old exam from an unfiltered dropdown
and enter marks against it for currently-enrolled students, producing a `Mark`
whose exam belongs to one year and whose students belong to another. `Mark` has
no `academicYearId` of its own to catch the inconsistency.

Fix: filter `listExams` by the active year, include the year in the response,
and assert `exam.academicYearId === academicYearId` in both marks functions.

- Files: `src/lib/exams.ts:10-21`, `src/lib/marks.ts:42-43, 99-100`

### 4.2 — Move `maxMarks` onto `Exam`

`maxMarks` currently lives per-`Mark`, set ad hoc by whichever teacher enters
first — two teachers can set different maxima for the same exam. Move it to
`Exam`, add `passMarks` (there is no pass/fail concept anywhere today) and
`weightage`.

### 4.3 — `Exam.published`

Parents currently see marks the instant a teacher saves a single subject. Add a
`published` boolean, default false, gate the parent-facing marks views on it,
and add an admin publish control.

### 4.4 — `Mark` field additions

`academicYearId` (redundant with the exam but catches the inconsistency at the
row level), `isAbsent` (an absent student is currently indistinguishable from
one whose marks are not yet entered), `remarks`, `gradePoint` (no GPA
aggregation is possible today), `enteredById` and `enteredAt`.

### 4.5 — Client-side validation and index

Marks entry has no client-side marks-within-max check. Add it. Add the
`Exam.examDate` index — the list is ordered on it every time.

**Phase 4 exit criteria:** no mark can be written whose exam belongs to a
different year than the student's enrollment; two teachers cannot set different
maxima for one exam; parents see no mark from an unpublished exam; an absent
student is distinguishable from an unentered one.

---

## Phase 5 — Fees as a ledger

**Findings:** C4, `Float → Decimal`, `FeeStatus.overdue`,
`FeeStructure.discount`/`fine`, the `FeePayment.paidDate` index, money formatting.

**Migration:** destructive — drops a unique constraint and changes a column type.

### 5.1 — C4: append-only `FeePayment`

`FeePayment` is unique on `(studentId, feeStructureId)` (`schema.prisma:411`),
so `recordPayment` upserts a single row per student per fee, accumulating
`amountPaid` while overwriting `paidDate` and `recordedById`. Once a second
instalment is recorded, the first one's date and the identity of the person who
recorded it are gone. There is no receipt number, no payment mode and no
transaction reference anywhere in the schema. A school cannot reconstruct its
own ledger, produce a receipt, or answer "who took this cash and when".

What is explicitly **not** wrong: the arithmetic and concurrency. The function
runs at `Serializable` isolation with an `EXCEEDS_AMOUNT_DUE` guard and a
`P2034` retry in the route — the best-engineered flow in the codebase. It is
storing the wrong shape of data. **The isolation level and retry must be
preserved exactly through this rework.**

Changes:

- Drop `@@unique([studentId, feeStructureId])`.
- One row per instalment; add `mode`, `receiptNo`, `reference`, `createdAt`.
- Derive `amountPaid` and `status` by aggregation rather than storing a running
  total on the row.
- `receiptNo` unique per school, generated in the same transaction as the write.

### 5.2 — Money as `Decimal`

`amountPaid` is `Float` (`schema.prisma:405`). Instalment sums in binary
floating point do not reconcile exactly against a fee structure's total, which
is what produces the "float tails" the audit saw in the UI. Convert
`FeePayment.amountPaid` and `FeeStructure.amount` to `Decimal`, and handle
`Prisma.Decimal` at every read boundary.

This is the reason the formatting fix belongs in this phase rather than Phase 8:
formatting a `Float` correctly only hides the discrepancy.

### 5.3 — `overdue`, discounts and fines

`FeeStatus` is `paid · partial · unpaid` with no `overdue`, and
`computeFeeStatus` never looks at `dueDate`, so nothing can drive a dunning
sequence. Add `overdue` and make the computation date-aware.

`FeeStructure` has a flat per-student amount with no waiver mechanism and no
late-fee computation. Add `discount` and `fineAmount`.

### 5.4 — Index and formatting

Add the `FeePayment.paidDate` index (ordered and counted on, currently
unindexed). Add a shared money formatter — `₹` with thousands separators and
fixed decimal places — and apply it everywhere money renders as `₹{amount}`.

**Phase 5 exit criteria:** every instalment is individually recoverable with its
date, mode, receipt number and recorder; a receipt can be produced from stored
data alone; sums reconcile exactly; `Serializable` + `P2034` retry behaviour is
unchanged, proven by the existing concurrency test still passing.

---

## Phase 6 — Rollover and faculty lifecycle

**Findings:** H6, staff-deactivation cascade, archived-class staffing.

**Migration:** none.

**Depends on Phase 3.**

### 6.1 — H6: carry a school forward into the new year

The confirm transaction (`promotion.ts:352-404`) touches `AcademicYear`,
`Enrollment`, `Student`, `PromotionLogEntry` and `PromotionRun` — and nothing
else. No `Class`, `ClassTeacher`, `TimetableEntry` or `FeeStructure` rows are
created for the new year. Every new year therefore begins with zero classes,
zero faculty, zero timetable and zero fee structures, all rebuilt by hand — and
until they are, attendance, marks, timetable and fee endpoints return empty
rosters for the whole school even though enrollments exist. Same silent-emptiness
failure mode as C3.

Add a rollover step to the promotion flow that clones, in dependency order:

1. `Class` (same grade + section, new year, `archived: false`)
2. `ClassTeacher` (remapped onto the cloned classes; teachers who are no longer
   active are skipped and reported)
3. `TimetableEntry` (remapped onto the cloned classes and their new
   `ClassTeacher` rows)
4. `FeeStructure`

With **per-entity opt-out** in the UI, run inside the confirm transaction, and
**idempotent** — re-running against a partially populated year adds only what is
missing. The rollover must be reversible by the Phase 3 revert, which is why
this phase depends on Phase 3's run-scoped delete.

### 6.2 — Staff deactivation cascade

Deactivating a staff member hard-deletes their `ClassTeacher` assignments
without restoring them on reactivation, and leaves their `TimetableEntry` rows
intact — so a deactivated teacher vanishes from faculty lists while still
appearing on the timetable.

Fix: soft-handle the assignment rather than deleting it, and either clear or
flag the orphaned timetable rows. Reactivation restores the prior state.

### 6.3 — Archived classes cannot be staffed

`ClassTeacher` creation does not check `class.archived`. Reject.

**Phase 6 exit criteria:** a confirmed promotion leaves the new year fully
operational — classes, faculty, timetable and fee structures present; reverting
that promotion removes exactly what the rollover created and nothing else;
deactivating and reactivating a teacher is lossless.

---

## Phase 7 — Records, enums and timestamps

**Findings:** H8, every row of the audit's missing-fields table, the enum
widening table, `Grade.sortOrder`, the remaining index gaps, the audit trail.

**Migration:** large. **Ships as two plan files:**

- **7a — schema and service layer:** all columns, enums, indexes, timestamps and
  the audit table, plus service-layer support. No form work.
- **7b — forms and views:** exposing the new fields in the admin UI, and the
  three "supported but not exposed" fixes.

Splitting on that seam keeps each plan small enough to execute end-to-end, and
7a is independently valuable — it unblocks Phase 1's grade inference follow-up
and the H8 audit trail regardless of whether 7b has landed.

### 7a — Schema

**H8: timestamps.** Zero of the 27 models carry `updatedAt`; only five carry
`createdAt` (`SyllabusVersion`, `Notification`, `OtpCode`, `Enrollment`,
`PromotionRun`). `User`, `Student`, `Mark`, `Attendance`, `FeePayment`,
`Assignment`, `Class`, `ClassTeacher` and `TimetableEntry` have neither. This
matters most where records are mutated by upsert: attendance and marks are
overwritten in place, `markedById` and the previous value replaced with no
history. For a system whose purpose is to be the school's record in a dispute
with a parent, that is a meaningful gap.

Add `createdAt`/`updatedAt` to all 27 models. Add an explicit **audit table** for
attendance and marks corrections recording the previous value, the new value,
the actor and the timestamp — timestamps alone cannot answer "what was it
before".

**Missing fields**, by model:

| Model | Add |
|---|---|
| `Student` | address, blood group, nationality, religion, previous school, emergency contact, category, admission date (distinct from date of join) |
| `User` (staff) | qualification, designation, joining date, salary, address, photo |
| `Grade` | `sortOrder` — grades currently sort alphabetically, "Grade 10" before "Grade 2", and promotion cannot infer the next grade |
| `Subject` | code, credit hours, weekly period count, theory/practical, `isElective` |
| `SyllabusVersion` | `effectiveFrom`, current-version pointer |
| `Class` | capacity, room — plus an over-enrolment guard on enrollment |
| `Assignment` | `maxMarks`, student submission file, graded score |
| `Notification` | channel, delivery status |
| `School` | address, phone, email, principal — report cards and receipts have no letterhead data |

**Enums:**

- `Gender` — add a third value. The field is nullable, so today the only way to
  represent anyone else is to leave it blank.
- `ParentStudent.relationship` — currently a free string defaulting to
  `"Guardian"`. Convert to an enum; typos otherwise fragment any reporting on
  guardianship.

**Indexes:** `Assignment.dueDate`. (`Attendance.date` lands in Phase 3,
`FeePayment.paidDate` in Phase 5, `Exam.examDate` in Phase 4.)

**Follow-up unblocked:** with `Grade.sortOrder` present, extend Phase 1's
`toClassId` validation to assert grade progression and to pre-populate promotion
mappings with the inferred next grade.

### 7b — Forms and views

Expose the 7a fields in the student, staff, subject, class and school forms.
Plus the three fields the backend already supports that no form exposes:

- **Syllabus `fileUrl`/`fileName`.** The API accepts a file, the schema stores
  it, and the list view renders a download link when one is present — but there
  is no file input, so no admin can ever produce that state. The upload pattern
  already works for assignment attachments and student photos; reuse it.
- **Staff `email`.** Column exists, no input anywhere.
- **Student `dob` on load.** The DOB input is seeded to an empty string even
  when editing, because the row type feeding the modal has no `dob` field.
  Omitting it is harmless — it is dropped from the PATCH — but the field is
  unusable for correction. Add `dob` to the row type.

Also: `School.name` is displayed but not editable and no PATCH route exists;
add one. Mark the current syllabus version with a badge in the list.

**Phase 7 exit criteria:** every model carries both timestamps; an attendance or
marks correction is fully reconstructable from the audit table; a standard
admission form has somewhere to put every field it collects; grades sort
numerically everywhere.

---

## Phase 8 — Front-end defects and stub cleanup

**Findings:** the ten systemic UI issues, notification routing, the four stub
pages, the parent child-switcher.

**Migration:** none.

| Issue | Fix |
|---|---|
| Notification routing | Every notification navigates to `/parent/assignments` regardless of type — a fee-due alert opens the homework list. `type` and `relatedId` are both stored and both ignored. Route by type. |
| Child switcher loses context | Switching child from Attendance, Marks or Fees returns to the overview. Stay on the current section. |
| Class filter matches on strings | The students view filters by grade name plus section rather than class ID, so "Grade 5 · A" in two different years collapses into one bucket. Filter by `classId`. |
| Modal accessibility | Shared by every admin CRUD dialog: no `role="dialog"`, no `aria-modal`, no focus trap, no focus return. (Escape-to-close already works.) Fix once in the shared component. |
| Inconsistent validation | Assignments validates client-side; Fees, Marks, Periods, Academic Years and Classes do not — no start-before-end checks, no non-negative amounts. Bring them up to the Assignments standard. |
| Double-submit | Only the assignments views guard against it. Every other mutating button can fire twice. Add a shared pending-state guard. |
| No search or pagination | Staff and Students render unbounded lists while Classes and Grades have both. Add both, matching the existing implementation. |
| Deactivate is hidden | For staff and students, "Deactivate" only appears after a delete has been attempted and refused. Show it unconditionally. |
| Raw date formatting | Dates render as raw ISO strings nearly everywhere; one component uses `toLocaleDateString`. Add a shared formatter. (Money formatting lands in Phase 5.) |
| Test OTP in production UI | The login page surfaces a test-OTP affordance with no visible environment gating in that file. Gate it explicitly on a non-production environment check. |

**Stub pages.** `reports` and `resources` are removed from navigation — they are
net-new modules, not remediation, and a dead nav item is worse than no nav item.
`settings` for teacher and accountant becomes a real minimal page rather than a
placeholder. `notifications` is built properly, since `type` and `relatedId` are
already stored and the routing fix above needs a real page to route into.
`academic-years/promote` is real but unreachable from navigation — link it.

**Phase 8 exit criteria:** no navigation entry leads to a placeholder; every
mutating control is double-submit safe; every admin dialog is keyboard- and
screen-reader-navigable; no notification opens the wrong page.

---

## Testing strategy

Each phase adds integration tests under `apps/web/tests/` following the existing
conventions — real Postgres, `resetDb()` in `beforeEach`, `fileParallelism:
false`. Component fixes add Testing Library tests alongside the existing
`*.test.tsx` files.

The audit's own observation shapes the approach:

> every Critical and High finding above sits in an untested path, because in each
> case the check that would be tested does not exist

So every finding is written as a **failing test first**. The test asserts the
new rejection or the new stored value; it fails against the current code; the
fix makes it pass. A phase that cannot produce a failing test for a finding has
misunderstood the finding.

Two suites need particular care:

- **`promotion-engine.test.ts`** (731 lines across draft, resume, mapping
  overwrite, decisions, confirm and both revert branches) is touched by Phases
  1, 3 and 6. Each phase extends it rather than restructuring it.
- **The fee concurrency test** must pass unchanged through Phase 5. If the
  ledger rework breaks it, the rework is wrong — the concurrency handling is
  correct today and is not in scope to change.

## Deferred decisions

Four questions the audit raised that are **not bugs**. Each was scoped out
deliberately, each is now worth revisiting, and none becomes a phase here. The
recommendation is recorded so the decision can be made on evidence later.

**Should syllabus and subjects be year-scoped?** The original spec explicitly
deferred this. The benchmark scopes both to the session (`courses.session_id`,
`syllabi.session_id`). A school changing its Grade 5 curriculum between years
currently has no way to express that without rewriting history — "current" means
"highest version number", globally, across all years at once.
*Recommendation:* yes, but only after Phase 6 proves the rollover model, since
year-scoped templates change what rollover has to clone.

**Should there be a Term model?** `Exam.term` is a free string. Three of the four
largest benchmark gaps — grading schemes, exam rules, consolidated results —
trace back to this single absence, and term aggregation and weighting are
impossible without it. *Recommendation:* this is the highest-value deferred item
and should be the next design after this remediation completes.

**Should the grading scale be configurable?** Currently hardcoded percentage
bands in code, against the benchmark's `grading_systems` + `grade_rules`.
*Recommendation:* fold into the Term design — a grading scheme without a term to
aggregate over has little to do.

**Should parents see the timetable and syllabus?** Both are fully modelled and
stored; only the pages are missing. Parents also cannot see their class
teacher's contact or upcoming exam dates. For a product whose stated
differentiation is being parent-obsessed, the timetable and syllabus omissions
are the most conspicuous. *Recommendation:* yes, and this is small — but it
pairs naturally with the **browse-a-past-year session switch**, also deferred,
because both need a year-selector concept that does not exist today (each page
independently resolves the active year server-side, so past years cannot be
browsed from any operational page).

## What this spec deliberately does not change

`ON DELETE RESTRICT` on every relation. This looks like an oversight and is not:
every delete path in `src/lib/school-setup/` pre-checks dependent-row counts and
returns `HAS_HISTORY` before attempting the delete. The database default and the
application guard agree. Leave it alone.
