# Phase 3: Attendance and Revert Correctness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Attendance` an academic year, fix all three defects in `revertPromotionRun`, widen `AttendanceStatus` so medical leave is distinguishable from truancy, bound admin marking to the academic year, and surface the `note` field that is stored but has no UI — finding H3 plus the attendance-related Medium findings.

**Architecture:** Eight sequential tasks. Task 1 adds the column that H3's root cause requires; Task 2 populates it. Tasks 3–5 fix the three separate defects in `revertPromotionRun` one at a time, each with its own test. Tasks 6–8 are the attendance-domain improvements that belong in the same slice. Each task lands as its own commit.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 (real-Postgres integration tests, `fileParallelism: false`), TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 3).

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` clean after every task; all previously-passing tests stay green. Record the baseline before Task 1.
- Discriminated-union `Result` types; new error codes are **additive**.
- Tests import `{ prisma, resetDb }` from `./helpers/db`, `await resetDb()` in `beforeEach`.
- Failing test first, always.
- **No live data** — migrations may add required columns and assume `prisma migrate reset`.
- **If Phase 2 has landed:** every `prisma migrate dev` in this phase will try to emit `DROP INDEX "AcademicYear_schoolId_active_key"` into the generated SQL. Read the generated migration and delete that line before applying. This applies to Tasks 1 and 6.

## Ordering note

Tasks 3–5 all modify `revertPromotionRun`. Do them in order — Task 5's fix depends on reading the transaction body that Task 4 rewrites.

**Phase 6 depends on this phase.** Rollover extends `confirmPromotionRun`, and building clone logic against Task 4's un-fixed over-broad delete would produce a revert that discards rows the clone created.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `prisma/schema.prisma` | `Attendance.academicYearId` + relation + indexes; `AttendanceStatus` enum values |
| `prisma/migrations/<ts>_attendance_academic_year/migration.sql` | The column, FK and indexes |
| `prisma/migrations/<ts>_widen_attendance_status/migration.sql` | Three new enum values |
| `src/lib/attendance.ts` | Write `academicYearId`; admin date bounds; accept the new statuses |
| `src/lib/attendance-status.ts` | Widen the cycle order and the value union |
| `src/lib/promotion.ts` | Three separate fixes in `revertPromotionRun` |
| `src/lib/dashboard/overview.ts`, `src/lib/parent/overview.ts` | Weighted attendance percentage |
| `src/components/attendance/*` | Note entry and display |

---

- [ ] **Task 0: Establish the baseline**

Run: `npm test 2>&1 | tail -20` and record the passing count. Stop and report if it is not green.

---

### Task 1: Add `Attendance.academicYearId`

`Attendance` (`schema.prisma:275-287`) has `studentId`, `date`, `status`, `markedById` and `note` — no year column. That is the root cause of H3's first defect: the revert guard cannot filter attendance by year, so it falls back to a bare date range with no school, class or student filter, and in a multi-tenant database every school's academic year spans roughly the same months. One school's attendance therefore permanently blocks another school's revert.

The audit also flags `Attendance.date` as an index gap: the only relevant index leads with `studentId`, so the four date-range-first scans in `dashboard/overview.ts` cannot use it.

**Files:**
- Modify: `apps/web/prisma/schema.prisma:275-287`
- Create: `apps/web/prisma/migrations/<timestamp>_attendance_academic_year/migration.sql` (generated)

**Interfaces:**
- Produces: `Attendance.academicYearId: Int` (required), `AcademicYear.attendances` back-relation, `@@index([academicYearId])`, `@@index([date])`.

- [ ] **Step 1: Update the schema**

Replace `model Attendance`:

```prisma
model Attendance {
  id             Int              @id @default(autoincrement())
  student        Student          @relation(fields: [studentId], references: [id])
  studentId      Int
  academicYear   AcademicYear     @relation(fields: [academicYearId], references: [id])
  academicYearId Int
  date           DateTime
  status         AttendanceStatus
  markedBy       User             @relation("MarkedBy", fields: [markedById], references: [id])
  markedById     Int
  note           String?

  @@unique([studentId, date])
  @@index([markedById])
  @@index([academicYearId])
  @@index([date])
}
```

The `@@unique([studentId, date])` stays as it is. A student has one attendance record per day regardless of year, and adding `academicYearId` to the key would let the same student have two records for one date across overlapping years.

Add the back-relation to `model AcademicYear`, alongside the existing `enrollments`, `classTeachers` etc.:

```prisma
  attendances      Attendance[]
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --create-only --name attendance_academic_year`

- [ ] **Step 3: Read the generated SQL before applying**

Open the generated `migration.sql`. Two things to check:

1. If Phase 2 has landed, delete any `DROP INDEX "AcademicYear_schoolId_active_key";` line. Prisma emits it because that index is not declared in the schema — see the Phase 2 plan's hazard note.
2. Prisma will emit `ADD COLUMN "academicYearId" INTEGER NOT NULL` with no default. On a database with existing `Attendance` rows this fails. That is acceptable here — there is no live data — but add a comment saying so, so the next reader is not left guessing:

```sql
-- No backfill: all environments are dev/seed only as of 2026-08-22. If this
-- migration is ever run against a database with existing Attendance rows it
-- will fail; the backfill would derive academicYearId from the enrollment
-- covering each row's date.
```

- [ ] **Step 4: Apply**

Run: `npx prisma migrate dev` then `npm run prisma:migrate:test`

Expected: both succeed. Existing tests that create `Attendance` rows now fail to compile — that is expected and Task 2 fixes them.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(attendance): add academicYearId column and date index"
```

---

### Task 2: Write `academicYearId` on every attendance write

`markAttendance` already receives `academicYearId` as a parameter (`attendance.ts:101`) and uses it to scope the enrollment check — it simply never writes it onto the row.

**Files:**
- Modify: `apps/web/src/lib/attendance.ts:139-161`
- Test: `apps/web/tests/attendance-api.test.ts` (extend), plus any test fixture that creates `Attendance` directly

**Interfaces:**
- Consumes: the column from Task 1.
- Produces: every `Attendance` row carries the year it was marked in.

- [ ] **Step 1: Write the failing test**

```typescript
it("stamps the academic year onto every attendance record", async () => {
  const result = await markAttendance(prisma, {
    classId,
    date: getSchoolLocalToday(),
    academicYearId: yearId,
    schoolId,
    teacherUserId: teacherId,
    role: "teacher",
    entries: [{ studentId, status: "present" }],
  });

  expect(result).toEqual({ ok: true });

  const record = await prisma.attendance.findFirst({ where: { studentId } });
  expect(record?.academicYearId).toBe(yearId);
});
```

Import `getSchoolLocalToday` from wherever `attendance.ts` imports it — teachers are locked to today, so a hardcoded date string will fail with `DATE_LOCKED`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/attendance-api.test.ts -t "stamps the academic year"`

Expected: FAIL — a Prisma error that `academicYearId` is missing and required.

- [ ] **Step 3: Write the column**

In the `upsert` inside `markAttendance`'s `$transaction`, add the field to `create` only. It must not be in `update` — an existing record's year is a historical fact and re-marking a day should not silently move it:

```typescript
        : prisma.attendance.upsert({
            where: { studentId_date: { studentId: entry.studentId, date: targetDate } },
            create: {
              studentId: entry.studentId,
              academicYearId: params.academicYearId,
              date: targetDate,
              status: entry.status,
              markedById: params.teacherUserId,
              note: entry.note ?? null,
            },
            update: {
              status: entry.status,
              markedById: params.teacherUserId,
              note: entry.note ?? null,
            },
          })
```

- [ ] **Step 4: Fix every fixture that creates Attendance directly**

Run: `grep -rn "attendance.create\|attendance.createMany" tests/ prisma/`

Each hit needs `academicYearId`. In test fixtures use the year the surrounding test already created; in `prisma/fixtures.ts` and `prisma/seed.ts` use the active year those files create. Do not add a default to the schema to avoid this work — a default would let a genuinely wrong year be written silently.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/attendance-api.test.ts tests/attendance-history.test.ts tests/dashboard-overview.test.ts`

- [ ] **Step 6: Full suite, typecheck, and reseed**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20 && npm run seed`

The seed run matters — a fixture file that still omits `academicYearId` compiles fine and only fails at runtime.

- [ ] **Step 7: Commit**

```bash
git add src/lib/attendance.ts tests prisma/fixtures.ts prisma/seed.ts
git commit -m "fix(attendance): stamp academicYearId on write"
```

---

### Task 3: Scope the revert activity guard by year (H3, defect 1)

`revertPromotionRun` runs six guard counts. Five filter by `academicYearId`, which implies a school. The sixth counts `Attendance` by a bare date range (`promotion.ts:433-435`):

```typescript
      prisma.attendance.count({
        where: { date: { gte: run.toAcademicYear.startDate, lte: run.toAcademicYear.endDate } },
      }),
```

No school, no class, no student. Since every school's academic year spans roughly the same months, School B marking attendance permanently blocks School A's revert.

**Files:**
- Modify: `apps/web/src/lib/promotion.ts:433-435`
- Test: `apps/web/tests/promotion-engine.test.ts` (extend)

**Interfaces:**
- Consumes: `Attendance.academicYearId` from Tasks 1–2.

- [ ] **Step 1: Write the failing test**

```typescript
it("is not blocked by another school's attendance in the same date range", async () => {
  // Arrange: confirm a promotion run for `schoolId` into `toYearId`.
  // Then create attendance for a DIFFERENT school inside the same dates.
  const otherSchool = await prisma.school.create({ data: { name: "Noisy Neighbour" } });
  const otherYear = await prisma.academicYear.create({
    data: {
      schoolId: otherSchool.id,
      name: "2027-28",
      startDate: new Date("2027-04-01"),
      endDate: new Date("2028-03-31"),
      status: "active",
    },
  });
  const otherGrade = await prisma.grade.create({ data: { schoolId: otherSchool.id, name: "Grade 1" } });
  const otherClass = await prisma.class.create({
    data: { schoolId: otherSchool.id, gradeId: otherGrade.id, section: "A", academicYearId: otherYear.id },
  });
  const otherStudent = await prisma.student.create({
    data: { schoolId: otherSchool.id, name: "Neighbour Kid", dob: new Date("2015-01-01"), admissionNo: "NB-001" },
  });
  await prisma.enrollment.create({
    data: { studentId: otherStudent.id, classId: otherClass.id, academicYearId: otherYear.id, status: "active" },
  });
  const otherTeacher = await prisma.user.create({
    data: { schoolId: otherSchool.id, phone: "+10000000088", role: "teacher", name: "Neighbour Teacher" },
  });
  await prisma.attendance.create({
    data: {
      studentId: otherStudent.id,
      academicYearId: otherYear.id,
      date: new Date("2027-06-15"),
      status: "present",
      markedById: otherTeacher.id,
    },
  });

  const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId });

  expect(result).toEqual({ ok: true });
});

it("is still blocked by this school's own attendance in the target year", async () => {
  // ...confirm a run, then mark attendance for a student in the TARGET year
  const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId });
  expect(result).toEqual({ ok: false, error: "YEAR_HAS_ACTIVITY" });
});
```

Both tests need a *confirmed* run. Reuse the existing confirm helper the file already uses for its revert tests rather than writing a new arrange block; read the file's existing revert coverage first.

The second test is the one that proves the guard still works. A fix that simply deletes the attendance count would pass the first test and fail this one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-engine.test.ts -t "another school's attendance"`

Expected: FAIL with `{ ok: false, error: "YEAR_HAS_ACTIVITY" }` — the neighbour's record blocks the revert.

- [ ] **Step 3: Scope the count**

Replace the sixth count:

```typescript
      prisma.attendance.count({ where: { academicYearId: run.toAcademicYearId } }),
```

The date range goes away entirely. `academicYearId` is strictly more precise: it captures exactly the records belonging to that year for that school, including any marked outside the nominal date window.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-engine.test.ts`

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/lib/promotion.ts tests/promotion-engine.test.ts
git commit -m "fix(promotion): scope the revert attendance guard by year (H3.1)"
```

---

### Task 4: Scope the revert delete to the run (H3, defect 2)

`promotion.ts:453`:

```typescript
    await tx.enrollment.deleteMany({ where: { academicYearId: run.toAcademicYearId } });
```

Scoped to the year, not the run. Reverting one promotion deletes **every** enrollment in the target year — including students enrolled manually through the students form, and students enrolled by a different promotion run.

The function already loads exactly what it needs to do this correctly: `logEntries` is fetched immediately above the transaction.

**Files:**
- Modify: `apps/web/src/lib/promotion.ts:449-453`
- Test: `apps/web/tests/promotion-engine.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
it("leaves manually-created enrollments in the target year intact", async () => {
  // Arrange: confirm a promotion run into toYearId.
  const bystander = await prisma.student.create({
    data: { schoolId, name: "Manual Enrollee", dob: new Date("2015-01-01"), admissionNo: "MAN-001" },
  });
  const targetClass = await prisma.class.findFirstOrThrow({
    where: { schoolId, academicYearId: toYearId },
  });
  const bystanderEnrollment = await prisma.enrollment.create({
    data: {
      studentId: bystander.id,
      classId: targetClass.id,
      academicYearId: toYearId,
      status: "active",
    },
  });

  const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId });
  expect(result).toEqual({ ok: true });

  const survivor = await prisma.enrollment.findUnique({ where: { id: bystanderEnrollment.id } });
  expect(survivor).not.toBeNull();
});

it("still removes the enrollments the run created", async () => {
  // ...confirm a run, capture the promoted student's new enrollment id
  const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId });
  expect(result).toEqual({ ok: true });

  const removed = await prisma.enrollment.findFirst({
    where: { studentId, academicYearId: toYearId },
  });
  expect(removed).toBeNull();
});
```

Both are required. The first proves the over-delete is gone; the second proves the revert still does its job.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-engine.test.ts -t "manually-created enrollments"`

Expected: FAIL — the bystander's enrollment is deleted, so `survivor` is null.

- [ ] **Step 3: Scope the delete**

Replace the `deleteMany` inside the transaction:

```typescript
    await tx.enrollment.deleteMany({
      where: {
        academicYearId: run.toAcademicYearId,
        studentId: { in: logEntries.map((entry) => entry.studentId) },
      },
    });
```

`logEntries` is already in scope — it is fetched on the lines immediately above the `$transaction` call. Keeping `academicYearId` in the filter alongside the student list matters: without it, a student who appears in this run's log *and* has an enrollment in some other year would lose both.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-engine.test.ts`

Expected: PASS, including both revert branches in the existing 731-line suite.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/lib/promotion.ts tests/promotion-engine.test.ts
git commit -m "fix(promotion): scope the revert enrollment delete to the run (H3.2)"
```

---

### Task 5: Fix blind reactivation on revert (H3, defect 3)

The revert transaction ends with (`promotion.ts:465-466`):

```typescript
    await tx.academicYear.update({ where: { id: run.fromAcademicYearId }, data: { status: "active" } });
    await tx.academicYear.update({ where: { id: run.toAcademicYearId }, data: { status: "upcoming" } });
```

Two problems, and the second is only visible once Phase 2 has landed.

1. **No check that another year is already active.** Exactly the condition H2 leaves unguarded.
2. **The statement order violates Phase 2's partial unique index.** At revert time the target year is `active` (set by confirm) and the source year is `archived`. This code activates the source *first*, so between the two statements both rows are `active`. A unique index is checked per statement, not deferred to commit, so Postgres rejects it — the revert throws a raw `P2002` instead of working.

Compare `confirmPromotionRun` (`promotion.ts:353-354`), which archives *then* activates and is therefore already safe. Revert must do the mirror image: demote the target first, then promote the source.

**Files:**
- Modify: `apps/web/src/lib/promotion.ts:409-413` (result union), `:465-466`
- Test: `apps/web/tests/promotion-engine.test.ts` (extend)

**Interfaces:**
- Produces: `RevertPromotionRunResult` gains `| { ok: false; error: "ANOTHER_YEAR_ACTIVE" }`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("reverts cleanly, leaving exactly one active year", async () => {
  // ...confirm a run so toYear is active and fromYear archived
  const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId });
  expect(result).toEqual({ ok: true });

  const activeYears = await prisma.academicYear.findMany({
    where: { schoolId, status: "active" },
  });
  expect(activeYears).toHaveLength(1);
  expect(activeYears[0].id).toBe(fromYearId);

  const target = await prisma.academicYear.findUnique({ where: { id: toYearId } });
  expect(target?.status).toBe("upcoming");
});

it("refuses to revert when an unrelated third year has been activated", async () => {
  // ...confirm a run, then activate a third year out of band, leaving toYear archived
  await prisma.academicYear.update({ where: { id: toYearId }, data: { status: "archived" } });
  const third = await prisma.academicYear.create({
    data: {
      schoolId,
      name: "2028-29",
      startDate: new Date("2028-04-01"),
      endDate: new Date("2029-03-31"),
      status: "active",
    },
  });

  const result = await revertPromotionRun(prisma, { promotionRunId: runId, schoolId });

  expect(result).toEqual({ ok: false, error: "ANOTHER_YEAR_ACTIVE" });
  expect((await prisma.academicYear.findUnique({ where: { id: third.id } }))?.status).toBe("active");
});
```

The first test is the regression guard for the ordering bug — without the reorder it fails with a thrown `P2002` rather than a clean assertion failure, which is itself the signal.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-engine.test.ts -t "exactly one active year"`

Expected (Phase 2 landed): the call throws a unique-constraint error.
Expected (Phase 2 not landed): the call succeeds but the second test fails, because nothing checks for a third active year.

- [ ] **Step 3: Add the pre-check**

Extend the result union with `| { ok: false; error: "ANOTHER_YEAR_ACTIVE" }`.

Insert after the `YEAR_HAS_ACTIVITY` guard and before `logEntries` is fetched:

```typescript
  const otherActive = await prisma.academicYear.findFirst({
    where: {
      schoolId: params.schoolId,
      status: "active",
      id: { notIn: [run.fromAcademicYearId, run.toAcademicYearId] },
    },
  });
  if (otherActive) return { ok: false, error: "ANOTHER_YEAR_ACTIVE" };
```

Excluding both of the run's own years is deliberate: the target year being active is the *normal* pre-revert state, and the source year being active would mean the revert has already happened.

- [ ] **Step 4: Reorder the two updates**

```typescript
    await tx.academicYear.update({ where: { id: run.toAcademicYearId }, data: { status: "upcoming" } });
    await tx.academicYear.update({ where: { id: run.fromAcademicYearId }, data: { status: "active" } });
```

Demote first, promote second. Add a comment so nobody reorders it back:

```typescript
    // Order matters: the partial unique index AcademicYear_schoolId_active_key
    // rejects two active rows per school, and it is checked per statement rather
    // than deferred to commit. Demote the target before promoting the source.
```

- [ ] **Step 5: Map the new error in the route**

Find the revert handler (`grep -rl "revertPromotionRun" src/app/api`) and add:

```typescript
      if (result.error === "ANOTHER_YEAR_ACTIVE") {
        return NextResponse.json(
          { error: "Another academic year is currently active — archive it before reverting" },
          { status: 400 }
        );
      }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-engine.test.ts`

- [ ] **Step 7: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/lib/promotion.ts src/app/api tests/promotion-engine.test.ts
git commit -m "fix(promotion): guard and reorder year reactivation on revert (H3.3)"
```

---

### Task 6: Widen `AttendanceStatus`

`present · absent · late` cannot express a half day, an excused absence or a holiday. Both percentage computations — `dashboard/overview.ts:103` and `parent/overview.ts:84` — are `records.filter(r => r.status === "present" || r.status === "late").length / records.length`, so `late` counts as fully present and everything else as fully absent. Medical leave is indistinguishable from truancy, and a school holiday drags every child's percentage down.

**Files:**
- Modify: `apps/web/prisma/schema.prisma:23-27`
- Create: migration (generated)
- Modify: `apps/web/src/lib/attendance-status.ts`, `src/lib/attendance.ts:106` (entry status union)
- Modify: `apps/web/src/lib/dashboard/overview.ts:103`, `src/lib/parent/overview.ts:64, 84`
- Test: `apps/web/tests/attendance-status.test.ts`, `tests/dashboard-overview.test.ts`

**Interfaces:**
- Produces: `AttendanceStatus` becomes `present | absent | late | half_day | excused | holiday`.
- Produces: `attendanceWeight(status): { counted: boolean; credit: number }` in `src/lib/attendance-status.ts`, consumed by both overview modules.

**Weighting rules**, applied identically in both places:

| Status | In denominator | Credit |
|---|---|---|
| `present` | yes | 1 |
| `late` | yes | 1 |
| `half_day` | yes | 0.5 |
| `absent` | yes | 0 |
| `excused` | **no** | — |
| `holiday` | **no** | — |

`excused` and `holiday` leave the denominator entirely. A child with three excused medical absences in a ten-day month is 100% attendant across seven marked days, not 70%.

- [ ] **Step 1: Write the failing tests**

In `tests/attendance-status.test.ts`:

```typescript
it("weights each status correctly", () => {
  expect(attendanceWeight("present")).toEqual({ counted: true, credit: 1 });
  expect(attendanceWeight("late")).toEqual({ counted: true, credit: 1 });
  expect(attendanceWeight("half_day")).toEqual({ counted: true, credit: 0.5 });
  expect(attendanceWeight("absent")).toEqual({ counted: true, credit: 0 });
  expect(attendanceWeight("excused")).toEqual({ counted: false, credit: 0 });
  expect(attendanceWeight("holiday")).toEqual({ counted: false, credit: 0 });
});

it("cycles through every markable status", () => {
  let s: AttendanceStatusValue = null;
  const seen: AttendanceStatusValue[] = [];
  for (let i = 0; i < 7; i++) {
    s = cycleAttendanceStatus(s);
    seen.push(s);
  }
  expect(seen).toEqual(["present", "absent", "late", "half_day", "excused", "holiday", null]);
});
```

In `tests/dashboard-overview.test.ts`, add a case asserting that a student with 1 present, 1 half_day and 1 excused record scores 75% — `(1 + 0.5) / 2` — not 33% and not 50%.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/attendance-status.test.ts`

Expected: FAIL — `attendanceWeight` does not exist.

- [ ] **Step 3: Widen the enum and migrate**

```prisma
enum AttendanceStatus {
  present
  absent
  late
  half_day
  excused
  holiday
}
```

Run: `npx prisma migrate dev --create-only --name widen_attendance_status`

Read the generated SQL. It should be three `ALTER TYPE "AttendanceStatus" ADD VALUE` statements. Delete any `DROP INDEX "AcademicYear_schoolId_active_key"` line. Then `npx prisma migrate dev && npm run prisma:migrate:test`.

Postgres does not allow `ALTER TYPE ... ADD VALUE` inside a transaction block in older versions; if the migration fails on that, split each `ADD VALUE` into its own statement separated by blank lines — Prisma runs migration files statement by statement.

- [ ] **Step 4: Update `attendance-status.ts`**

```typescript
export type AttendanceStatusValue =
  | "present"
  | "absent"
  | "late"
  | "half_day"
  | "excused"
  | "holiday"
  | null;

const CYCLE_ORDER: AttendanceStatusValue[] = [
  null,
  "present",
  "absent",
  "late",
  "half_day",
  "excused",
  "holiday",
];

export function cycleAttendanceStatus(current: AttendanceStatusValue): AttendanceStatusValue {
  const currentIndex = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length];
}

export function attendanceWeight(
  status: Exclude<AttendanceStatusValue, null>
): { counted: boolean; credit: number } {
  switch (status) {
    case "present":
    case "late":
      return { counted: true, credit: 1 };
    case "half_day":
      return { counted: true, credit: 0.5 };
    case "absent":
      return { counted: true, credit: 0 };
    case "excused":
    case "holiday":
      return { counted: false, credit: 0 };
  }
}
```

The exhaustive `switch` with no `default` is deliberate — adding a seventh status later will fail the typecheck here rather than silently defaulting.

Widen the `entries` status union in `markAttendance` (`attendance.ts:106`) to match, and the `status` union in `parent/overview.ts:64`.

- [ ] **Step 5: Replace both percentage computations**

In `dashboard/overview.ts` and `parent/overview.ts`, replace the `attended` line and the percentage that follows it with:

```typescript
  const weighted = records.reduce(
    (acc, r) => {
      const { counted, credit } = attendanceWeight(r.status);
      return counted ? { total: acc.total + 1, credit: acc.credit + credit } : acc;
    },
    { total: 0, credit: 0 }
  );
  const attendancePercent = weighted.total === 0 ? 0 : Math.round((weighted.credit / weighted.total) * 100);
```

Read each call site and adapt the surrounding variable names — the two files use slightly different ones (`attendanceMonthPercent` in the parent module). Do not copy this snippet in blind.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/attendance-status.test.ts tests/dashboard-overview.test.ts tests/attendance-view.test.tsx`

Any UI test asserting a three-way status cycle now sees six. Update the test expectation, not the cycle order.

- [ ] **Step 7: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib/attendance-status.ts src/lib/attendance.ts src/lib/dashboard/overview.ts src/lib/parent/overview.ts tests
git commit -m "feat(attendance): widen status enum and weight percentages"
```

---

### Task 7: Bound admin attendance marking to the academic year

Teachers are correctly locked to today (`attendance.ts:109-112`). Admins get the `else` branch, which checks only that the class belongs to the school — so an admin can mark attendance for any date at all, past or future, inside or outside any academic year.

**Files:**
- Modify: `apps/web/src/lib/attendance.ts:90-127`
- Test: `apps/web/tests/attendance-api.test.ts` (extend)

**Interfaces:**
- Produces: `MarkAttendanceResult` gains `| { ok: false; error: "DATE_OUTSIDE_YEAR" }`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("refuses an admin marking a date before the academic year starts", async () => {
  const result = await markAttendance(prisma, {
    classId,
    date: "2020-01-15",
    academicYearId: yearId,
    schoolId,
    teacherUserId: adminId,
    role: "admin",
    entries: [{ studentId, status: "present" }],
  });

  expect(result).toEqual({ ok: false, error: "DATE_OUTSIDE_YEAR" });
  expect(await prisma.attendance.count({ where: { studentId } })).toBe(0);
});

it("refuses an admin marking a date after the academic year ends", async () => {
  const result = await markAttendance(prisma, {
    classId,
    date: "2099-01-15",
    academicYearId: yearId,
    schoolId,
    teacherUserId: adminId,
    role: "admin",
    entries: [{ studentId, status: "present" }],
  });

  expect(result).toEqual({ ok: false, error: "DATE_OUTSIDE_YEAR" });
});

it("allows an admin marking a past date inside the academic year", async () => {
  // yearId spans 2026-04-01 to 2027-03-31 in this file's fixture
  const result = await markAttendance(prisma, {
    classId,
    date: "2026-06-15",
    academicYearId: yearId,
    schoolId,
    teacherUserId: adminId,
    role: "admin",
    entries: [{ studentId, status: "present" }],
  });

  expect(result).toEqual({ ok: true });
});
```

Check the fixture's actual year dates and adjust the third test's date so it really is inside the range.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/attendance-api.test.ts -t "before the academic year"`

Expected: FAIL — the mark succeeds.

- [ ] **Step 3: Add the bound check**

Extend the result union, then replace the `else` branch:

```typescript
  } else {
    const klass = await prisma.class.findFirst({
      where: { id: params.classId, schoolId: params.schoolId },
    });
    if (!klass) return { ok: false, error: "NOT_ASSIGNED" };

    const year = await prisma.academicYear.findFirst({
      where: { id: params.academicYearId, schoolId: params.schoolId },
    });
    if (!year) return { ok: false, error: "NOT_ASSIGNED" };

    const target = new Date(params.date);
    if (target < year.startDate || target > year.endDate) {
      return { ok: false, error: "DATE_OUTSIDE_YEAR" };
    }
  }
```

The teacher branch needs no change — a teacher locked to today is already inside the year by construction, and adding a second check there would reject a legitimate mark on the year's first or last day if the school's timezone offset pushed it over.

- [ ] **Step 4: Map the error in the route**

`grep -rl "markAttendance" src/app/api` and add a 400 branch with the message "That date falls outside the academic year".

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/attendance-api.test.ts tests/attendance-review-panel.test.tsx`

- [ ] **Step 6: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/lib/attendance.ts src/app/api tests/attendance-api.test.ts
git commit -m "fix(attendance): bound admin marking to the academic year"
```

---

### Task 8: Surface the attendance note

`Attendance.note` is stored, is written by `markAttendance` when supplied, and is surfaced in the parent-facing design — but no UI exists to enter or read one, so it is always null in practice.

**Files:**
- Modify: the attendance marking component (`grep -rln "markAttendance\|/api/attendance" src/components/attendance`)
- Modify: the parent attendance view, to display a note where one exists
- Test: `apps/web/tests/attendance-view.test.tsx` (extend)

**Interfaces:**
- Consumes: `markAttendance`'s existing `entries[].note` parameter. No service change is needed.

- [ ] **Step 1: Write the failing test**

```typescript
it("sends the typed note along with the status", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  vi.stubGlobal("fetch", fetchMock);

  render(/* the attendance view with one student in the roster */);

  await userEvent.click(screen.getByRole("button", { name: /mark .* present/i }));
  await userEvent.type(screen.getByLabelText(/note for /i), "Left early, dentist");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
  expect(body.entries[0].note).toBe("Left early, dentist");
});
```

Read the existing `tests/attendance-view.test.tsx` first and match its render helpers and roster fixture shape. The button and label names above are placeholders for whatever the component actually exposes — align the test to the component's real accessible names, and give the new input an `aria-label` of the form `Note for {student name}`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/attendance-view.test.tsx -t "typed note"`

Expected: FAIL — no note input exists.

- [ ] **Step 3: Add the note input**

Add a per-student text input to the marking row, held in a `Record<number, string>` state keyed by student id, exactly as the component already holds status. Include it in the request payload:

```typescript
entries: roster.map((student) => ({
  studentId: student.id,
  status: statuses[student.id] ?? null,
  note: notes[student.id] || undefined,
})),
```

Send `undefined` rather than `""` for an empty note so the service writes `null` instead of an empty string.

- [ ] **Step 4: Display the note in the parent view**

In the parent attendance view, render the note beneath the day's status where one is present. Add `note` to whatever row type feeds that component and to the query that builds it — the column exists on `Attendance`, it is simply not projected today.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/attendance-view.test.tsx tests/attendance-history.test.ts`

- [ ] **Step 6: Full suite and typecheck**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components src/lib tests
git commit -m "feat(attendance): add note entry and parent-side display"
```

---

## Phase 3 Exit Criteria

- [ ] Another school's attendance never blocks a revert; this school's own attendance in the target year still does.
- [ ] Reverting one run leaves manual enrollments and other runs' enrollments in the target year intact, and still removes its own.
- [ ] A revert leaves exactly one active year, and is refused with `ANOTHER_YEAR_ACTIVE` when a third year has been activated out of band.
- [ ] Attendance percentages exclude `excused` and `holiday` from the denominator and credit `half_day` at 0.5, in both the dashboard and the parent overview.
- [ ] An admin cannot mark attendance outside the academic year's date range; a teacher is still locked to today.
- [ ] A note typed against a student is stored and shown to that student's parent.
- [ ] Every `Attendance` row carries `academicYearId`; `npm run seed` succeeds.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm test` all clean.

## What Phase 3 deliberately leaves open

- **No audit trail on overwrite.** Attendance is still upserted in place — `markedById` and the previous status are replaced with no history. H8's audit table is Phase 7a.
- **No holiday calendar.** `holiday` is now a markable status, but nothing bulk-applies it across a school or a date range. That is a feature, not a finding.
- **Period-level attendance.** The audit lists it under `Attendance` missing fields; daily-per-student remains the only mode. Deferred with the benchmark comparison.
