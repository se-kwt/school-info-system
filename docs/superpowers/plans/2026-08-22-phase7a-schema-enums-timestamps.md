# Phase 7a: Records, Enums and Timestamps (Schema) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every model a create and update timestamp, add an audit table for attendance and marks corrections, add the columns a real admission and HR record needs, widen two enums, and give `Grade` a sort order — finding H8 plus the schema half of the audit's missing-fields and enum tables.

**Architecture:** Eight sequential tasks, each one migration plus its service-layer support. No form work — that is Phase 7b. Splitting on this seam keeps each plan executable end-to-end, and 7a is independently valuable: it unblocks the promotion grade-inference follow-up from Phase 1 and delivers the audit trail regardless of whether 7b lands.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 (real-Postgres integration tests, `fileParallelism: false`), TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 7a).

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` clean after every task; previously-passing tests stay green. Record the baseline before Task 1.
- Discriminated-union `Result` types; new error codes are **additive**.
- Tests import `{ prisma, resetDb }` from `./helpers/db`, `await resetDb()` in `beforeEach`.
- Failing test first, always.
- **No live data** — migrations may add required columns and assume `prisma migrate reset`.
- **If Phase 2 has landed:** read every generated migration and delete any `DROP INDEX "AcademicYear_schoolId_active_key"` line before applying. This applies to every task in this phase.
- **Every new column is nullable or has a default** unless a task says otherwise. A required column with no default breaks `prisma migrate reset` on a seeded database and forces a fixture change for a field nobody has filled in yet.

## Scope discipline

This phase adds columns and enum values. It does **not**:

- expose anything in a form (Phase 7b),
- populate `Mark.gradePoint` (needs the deferred grading scheme),
- act on `Notification.deliveryStatus` (there is no delivery pipeline to report into).

Adding a column that nothing writes is deliberate here: it is one migration now rather than two later, and Phase 7b and the deferred work both depend on the columns existing.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `prisma/schema.prisma` | Every schema change below |
| `src/lib/audit.ts` | **New** — `recordAttendanceChange`, `recordMarkChange` |
| `src/lib/attendance.ts`, `src/lib/marks.ts` | Emit audit rows on overwrite |
| `src/lib/school-setup/grades.ts` | `sortOrder` on create and list ordering |
| `src/lib/promotion.ts` | Grade-progression assertion and mapping inference |

---

- [ ] **Task 0: Establish the baseline**

Run: `npm test 2>&1 | tail -20` and record the passing count.

---

### Task 1: `createdAt` and `updatedAt` on all 27 models

Only five models carry `createdAt` (`SyllabusVersion`, `Notification`, `OtpCode`, `Enrollment`, `PromotionRun`) and **none** carries `updatedAt`. `User`, `Student`, `Mark`, `Attendance`, `FeePayment`, `Assignment`, `Class`, `ClassTeacher` and `TimetableEntry` have neither.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (every model)
- Create: migration (generated)
- Test: `apps/web/tests/schema-timestamps.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";

describe("schema timestamps", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stamps createdAt and updatedAt on a Student", async () => {
    const school = await prisma.school.create({ data: { name: "Timestamp School" } });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test", dob: new Date("2015-01-01"), admissionNo: "TS-001" },
    });

    expect(student.createdAt).toBeInstanceOf(Date);
    expect(student.updatedAt).toBeInstanceOf(Date);
  });

  it("advances updatedAt on modification but leaves createdAt alone", async () => {
    const school = await prisma.school.create({ data: { name: "Timestamp School" } });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test", dob: new Date("2015-01-01"), admissionNo: "TS-002" },
    });

    await new Promise((r) => setTimeout(r, 10));
    const updated = await prisma.student.update({
      where: { id: student.id },
      data: { name: "Renamed" },
    });

    expect(updated.createdAt.getTime()).toBe(student.createdAt.getTime());
    expect(updated.updatedAt.getTime()).toBeGreaterThan(student.updatedAt.getTime());
  });

  it("stamps timestamps on every model that can be created standalone", async () => {
    const school = await prisma.school.create({ data: { name: "Coverage School" } });
    expect(school.createdAt).toBeInstanceOf(Date);
    expect(school.updatedAt).toBeInstanceOf(Date);

    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 1" } });
    expect(grade.createdAt).toBeInstanceOf(Date);
    expect(grade.updatedAt).toBeInstanceOf(Date);

    const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Maths" } });
    expect(subject.createdAt).toBeInstanceOf(Date);
    expect(subject.updatedAt).toBeInstanceOf(Date);
  });
});
```

The 10ms sleep is needed because Postgres `now()` has microsecond resolution but two statements in quick succession can land in the same millisecond after JavaScript rounding. Do not remove it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/schema-timestamps.test.ts`

Expected: FAIL to compile — `createdAt` is not a property of `Student`.

- [ ] **Step 3: Add the fields to every model**

For each of the 27 models in `prisma/schema.prisma`, add:

```prisma
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
```

Place them last among the scalar fields, before the relation list, matching where `SyllabusVersion` already puts `createdAt`.

The five models that already have `createdAt` need only `updatedAt` added — do not duplicate the existing column.

Verify coverage before migrating:

```bash
echo "models: $(grep -c '^model ' prisma/schema.prisma)"
echo "createdAt: $(grep -c 'createdAt DateTime' prisma/schema.prisma)"
echo "updatedAt: $(grep -c 'updatedAt DateTime' prisma/schema.prisma)"
```

All three must print 27.

- [ ] **Step 4: Migrate**

Run: `npx prisma migrate dev --create-only --name add_timestamps_everywhere`

Read the SQL. Prisma emits `ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` and the same for `updatedAt` — both safe on populated tables because of the default. Delete any stray `DROP INDEX "AcademicYear_schoolId_active_key"` line.

Then `npx prisma migrate dev && npm run prisma:migrate:test`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/schema-timestamps.test.ts`

- [ ] **Step 6: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

Adding defaulted columns should break nothing. If a test fails on an exact-object assertion against a whole row (`expect(row).toEqual({...})`), the new keys are the cause — switch it to `toMatchObject`.

- [ ] **Step 7: Commit**

```bash
git add prisma tests/schema-timestamps.test.ts
git commit -m "feat(schema): add createdAt and updatedAt to all 27 models (H8)"
```

---

### Task 2: An audit trail for attendance and marks corrections

Timestamps say *when* a row last changed. They cannot say what it changed **from**, or who changed it. Attendance and marks are both overwritten in place by upsert — `markedById` and the previous value are simply replaced. For a system whose purpose is to be the school's record in a dispute with a parent, "her attendance was changed from present to absent on the 14th, by whom?" is exactly the question that must be answerable.

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: migration, `apps/web/src/lib/audit.ts`
- Modify: `apps/web/src/lib/attendance.ts`, `src/lib/marks.ts`
- Test: `apps/web/tests/audit.test.ts` (create)

**Interfaces:**
- Produces: `RecordCorrection` model.
- Produces: `recordAttendanceChange(tx, { studentId, date, fromStatus, toStatus, actorUserId })`.
- Produces: `recordMarkChange(tx, { studentId, examId, subjectId, fromValue, toValue, actorUserId })`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("records an attendance correction with the previous value", async () => {
  const today = getSchoolLocalToday();
  await markAttendance(prisma, {
    classId, date: today, academicYearId: yearId, schoolId,
    teacherUserId: teacherId, role: "teacher",
    entries: [{ studentId, status: "present" }],
  });
  await markAttendance(prisma, {
    classId, date: today, academicYearId: yearId, schoolId,
    teacherUserId: teacherId, role: "teacher",
    entries: [{ studentId, status: "absent" }],
  });

  const corrections = await prisma.recordCorrection.findMany({
    where: { entity: "attendance", studentId },
  });

  expect(corrections).toHaveLength(1);
  expect(corrections[0].fromValue).toBe("present");
  expect(corrections[0].toValue).toBe("absent");
  expect(corrections[0].actorUserId).toBe(teacherId);
});

it("records nothing on the first mark of a day", async () => {
  await markAttendance(prisma, {
    classId, date: getSchoolLocalToday(), academicYearId: yearId, schoolId,
    teacherUserId: teacherId, role: "teacher",
    entries: [{ studentId, status: "present" }],
  });

  expect(await prisma.recordCorrection.count()).toBe(0);
});

it("records nothing when the value is unchanged", async () => {
  const today = getSchoolLocalToday();
  const entries = [{ studentId, status: "present" as const }];
  await markAttendance(prisma, { classId, date: today, academicYearId: yearId, schoolId, teacherUserId: teacherId, role: "teacher", entries });
  await markAttendance(prisma, { classId, date: today, academicYearId: yearId, schoolId, teacherUserId: teacherId, role: "teacher", entries });

  expect(await prisma.recordCorrection.count()).toBe(0);
});

it("records a marks correction with the previous score", async () => {
  await enterMarks(prisma, { classId, examId, subjectId, teacherUserId: teacherId, schoolId, academicYearId: yearId, entries: [{ studentId, marksObtained: 70 }] });
  await enterMarks(prisma, { classId, examId, subjectId, teacherUserId: teacherId, schoolId, academicYearId: yearId, entries: [{ studentId, marksObtained: 85 }] });

  const corrections = await prisma.recordCorrection.findMany({ where: { entity: "mark", studentId } });

  expect(corrections).toHaveLength(1);
  expect(corrections[0].fromValue).toBe("70");
  expect(corrections[0].toValue).toBe("85");
});
```

The second and third tests matter as much as the first. An audit table that logs every write rather than every *change* fills with noise and becomes useless.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/audit.test.ts`

Expected: FAIL — `prisma.recordCorrection` does not exist.

- [ ] **Step 3: Add the model**

```prisma
enum CorrectionEntity {
  attendance
  mark
}

model RecordCorrection {
  id        Int              @id @default(autoincrement())
  entity    CorrectionEntity
  student   Student          @relation(fields: [studentId], references: [id])
  studentId Int

  /// For attendance: the date marked. For marks: null.
  date      DateTime?
  /// For marks: the exam and subject. For attendance: both null.
  examId    Int?
  subjectId Int?

  fromValue String
  toValue   String

  actor       User     @relation("CorrectionActor", fields: [actorUserId], references: [id])
  actorUserId Int

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([studentId])
  @@index([entity, studentId])
  @@index([actorUserId])
}
```

One table with a discriminator rather than two tables. Attendance and marks corrections are read together — "everything that was changed about this student" is the question a disputing parent triggers — and a single table answers it in one query.

`fromValue` and `toValue` are strings, holding `"present"` for attendance and `"70"` for a mark. Typing them per-entity would need two tables, which is the design just rejected. The stringification lives in `audit.ts` so it is done in one place.

Add the `Student` and `User` back-relations, and add `RecordCorrection` to the top of `resetDb()` in `tests/helpers/db.ts` — before `student.deleteMany()`, since it references students.

- [ ] **Step 4: Migrate**

Run `npx prisma migrate dev --create-only --name record_corrections`, read the SQL, delete any stray `DROP INDEX` line, apply, and `npm run prisma:migrate:test`.

- [ ] **Step 5: Write `src/lib/audit.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";

export async function recordAttendanceChange(
  prisma: PrismaClient,
  params: {
    studentId: number;
    date: Date;
    fromStatus: string;
    toStatus: string;
    actorUserId: number;
  }
): Promise<void> {
  if (params.fromStatus === params.toStatus) return;

  await prisma.recordCorrection.create({
    data: {
      entity: "attendance",
      studentId: params.studentId,
      date: params.date,
      fromValue: params.fromStatus,
      toValue: params.toStatus,
      actorUserId: params.actorUserId,
    },
  });
}

export async function recordMarkChange(
  prisma: PrismaClient,
  params: {
    studentId: number;
    examId: number;
    subjectId: number;
    fromValue: number;
    toValue: number;
    actorUserId: number;
  }
): Promise<void> {
  if (params.fromValue === params.toValue) return;

  await prisma.recordCorrection.create({
    data: {
      entity: "mark",
      studentId: params.studentId,
      examId: params.examId,
      subjectId: params.subjectId,
      fromValue: String(params.fromValue),
      toValue: String(params.toValue),
      actorUserId: params.actorUserId,
    },
  });
}

export function isRecordChanged(before: unknown, after: unknown): boolean {
  return before !== after;
}
```

The no-op-on-unchanged guard lives inside both functions, so no caller can forget it.

- [ ] **Step 6: Emit from `markAttendance`**

`markAttendance` currently builds its `$transaction` as an array of upserts, which cannot read the prior value. Convert it to an interactive transaction so each entry can read-then-write:

```typescript
  const targetDate = new Date(params.date);
  await prisma.$transaction(async (tx) => {
    for (const entry of params.entries) {
      const existing = await tx.attendance.findUnique({
        where: { studentId_date: { studentId: entry.studentId, date: targetDate } },
      });

      if (entry.status === null) {
        if (existing) {
          await tx.attendance.delete({ where: { id: existing.id } });
          await recordAttendanceChange(tx as PrismaClient, {
            studentId: entry.studentId,
            date: targetDate,
            fromStatus: existing.status,
            toStatus: "cleared",
            actorUserId: params.teacherUserId,
          });
        }
        continue;
      }

      if (existing) {
        await tx.attendance.update({
          where: { id: existing.id },
          data: { status: entry.status, markedById: params.teacherUserId, note: entry.note ?? null },
        });
        await recordAttendanceChange(tx as PrismaClient, {
          studentId: entry.studentId,
          date: targetDate,
          fromStatus: existing.status,
          toStatus: entry.status,
          actorUserId: params.teacherUserId,
        });
      } else {
        await tx.attendance.create({
          data: {
            studentId: entry.studentId,
            academicYearId: params.academicYearId,
            date: targetDate,
            status: entry.status,
            markedById: params.teacherUserId,
            note: entry.note ?? null,
          },
        });
      }
    }
  });
```

The create branch emits nothing — a first mark is not a correction.

This is a real behavioural change to a hot path: N entries now cost 2N round-trips inside one transaction rather than N. For a class of 40 that is acceptable. If the attendance suite starts timing out, raise the transaction timeout rather than reverting to a batch that cannot audit.

- [ ] **Step 7: Emit from `enterMarks`**

Same conversion. Read the existing `Mark` by the `examId_studentId_subjectId` unique key before writing, and call `recordMarkChange` with `existing.marksObtained` when one is found.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/audit.test.ts tests/attendance-api.test.ts tests/attendance-history.test.ts tests/marks-lib.test.ts tests/marks-api.test.ts`

- [ ] **Step 9: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 10: Commit**

```bash
git add prisma src/lib/audit.ts src/lib/attendance.ts src/lib/marks.ts tests
git commit -m "feat(audit): record attendance and marks corrections (H8)"
```

---

### Task 3: `Grade.sortOrder`

Grades sort alphabetically — "Grade 10" before "Grade 2" — everywhere they are listed. And promotion cannot infer the next grade, so every mapping in the wizard is manual.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`Grade`), `src/lib/school-setup/grades.ts`
- Create: migration
- Test: `apps/web/tests/grades-lib.test.ts` (extend)

**Interfaces:**
- Produces: `Grade.sortOrder Int @default(0)`, `@@unique([schoolId, sortOrder])`.
- Produces: `createGrade` accepts `sortOrder`; `listGrades` orders by it.

- [ ] **Step 1: Write the failing tests**

```typescript
it("orders grades numerically, not alphabetically", async () => {
  await createGrade(prisma, schoolId, { name: "Grade 2", sortOrder: 2 });
  await createGrade(prisma, schoolId, { name: "Grade 10", sortOrder: 10 });
  await createGrade(prisma, schoolId, { name: "Grade 1", sortOrder: 1 });

  const grades = await listGrades(prisma, schoolId);

  expect(grades.map((g) => g.name)).toEqual(["Grade 1", "Grade 2", "Grade 10"]);
});

it("refuses a duplicate sort order within a school", async () => {
  await createGrade(prisma, schoolId, { name: "Grade 1", sortOrder: 1 });
  const result = await createGrade(prisma, schoolId, { name: "Grade One", sortOrder: 1 });

  expect(result).toEqual({ ok: false, error: "DUPLICATE_SORT_ORDER" });
});

it("allows the same sort order in different schools", async () => {
  const other = await prisma.school.create({ data: { name: "Other" } });
  await createGrade(prisma, schoolId, { name: "Grade 1", sortOrder: 1 });
  const result = await createGrade(prisma, other.id, { name: "Grade 1", sortOrder: 1 });

  expect(result.ok).toBe(true);
});
```

Read `createGrade`'s current signature and result type first, and adapt these to it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/grades-lib.test.ts -t "numerically"`

- [ ] **Step 3: Add the column**

```prisma
model Grade {
  id        Int       @id @default(autoincrement())
  school    School    @relation(fields: [schoolId], references: [id])
  schoolId  Int
  name      String
  sortOrder Int       @default(0)
  subjects  Subject[]
  classes   Class[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([schoolId, name])
  @@unique([schoolId, sortOrder])
}
```

`@@unique([schoolId, sortOrder])` is what makes "the next grade" well-defined — without it two grades can share an order and inference becomes ambiguous.

The `@default(0)` combined with that unique constraint means **the migration fails if a school already has two or more grades**, because they all default to 0. There is no live data, so `prisma migrate reset` handles it — but the seed and fixtures must assign distinct orders. Note this in the migration:

```sql
-- Requires distinct sortOrder per school. Existing grades all default to 0, so
-- this migration fails on any school with 2+ grades. No live data as of
-- 2026-08-22; run `prisma migrate reset` and reseed. A real backfill would
-- assign sortOrder by parsing the numeric part of each grade name.
```

- [ ] **Step 4: Update `createGrade` and `listGrades`**

Add `sortOrder: number` to `createGrade`'s input, add `DUPLICATE_SORT_ORDER` to its result union, and catch the unique violation using the existing `isUniqueConstraintViolation` helper from `src/lib/school-setup/prisma-errors.ts` — check its `uniqueConstraintTarget` for `sortOrder` to distinguish it from the name collision the function already handles.

Change `listGrades`'s ordering to `orderBy: { sortOrder: "asc" }`. Then find every other place grades are ordered:

```bash
grep -rn "grade.*orderBy\|orderBy.*grade" src/
```

Each must move to `sortOrder`. The classes list, the grade dropdown in the student form and the timetable class picker are all affected.

- [ ] **Step 5: Update the seed and fixtures**

`prisma/fixtures.ts` and `prisma/seed.ts` create grades. Assign each a distinct `sortOrder` matching its number.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/grades-lib.test.ts tests/grades-api.test.ts tests/classes-lib.test.ts`

- [ ] **Step 7: Full suite, typecheck, build, reseed**

Run: `npx prisma migrate reset --force && npm run prisma:migrate:test && npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

`migrate reset` rather than `migrate dev` here — the unique constraint makes this the one migration in the phase that genuinely needs a clean database.

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib src/components tests
git commit -m "feat(grades): add sortOrder for numeric ordering"
```

---

### Task 4: Assert grade progression on promotion

The Phase 1 follow-up. With `sortOrder` in place, `validateTargetClasses` can now check that a promotion moves students *up*, and the wizard can pre-fill each mapping with the inferred next grade.

**Files:**
- Modify: `apps/web/src/lib/promotion.ts` (`validateTargetClasses`, `startPromotionRun`)
- Test: `apps/web/tests/promotion-engine.test.ts` (extend)

**Interfaces:**
- Consumes: `Grade.sortOrder` from Task 3, `validateTargetClasses` from Phase 1 Task 3.
- Produces: `UpdateMappingsResult` gains `| { ok: false; error: "INVALID_GRADE_PROGRESSION" }`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("refuses a mapping that promotes into a lower grade", async () => {
  // fromClass is Grade 3 (sortOrder 3); target is Grade 1 (sortOrder 1)
  const result = await updateMappings(prisma, {
    promotionRunId: runId,
    schoolId,
    mappings: [{ fromClassId, toClassId: grade1ClassId }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_GRADE_PROGRESSION" });
});

it("refuses a mapping that skips more than one grade", async () => {
  // Grade 3 -> Grade 10
  const result = await updateMappings(prisma, {
    promotionRunId: runId,
    schoolId,
    mappings: [{ fromClassId, toClassId: grade10ClassId }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_GRADE_PROGRESSION" });
});

it("accepts promotion into the next grade up", async () => {
  const result = await updateMappings(prisma, {
    promotionRunId: runId,
    schoolId,
    mappings: [{ fromClassId, toClassId: grade4ClassId }],
  });

  expect(result).toEqual({ ok: true });
});

it("accepts retention in the same grade", async () => {
  const result = await updateMappings(prisma, {
    promotionRunId: runId,
    schoolId,
    mappings: [{ fromClassId, toClassId: grade3NextYearClassId }],
  });

  expect(result).toEqual({ ok: true });
});

it("pre-fills each mapping with the next grade's class when one exists", async () => {
  // ...a target year already containing Grade 4 A
  const run = await startPromotionRun(prisma, { schoolId, initiatedById: adminId, toAcademicYearId: toYearId });

  expect(run.ok).toBe(true);
  if (!run.ok) return;
  const mapping = run.mappings.find((m) => m.fromClassId === grade3ClassId);
  expect(mapping?.toClassId).toBe(grade4ClassId);
});
```

The fourth test is essential: same-grade is a **retention**, which is legitimate. A check that demands strict progression breaks the retained-student path.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-engine.test.ts -t "lower grade"`

- [ ] **Step 3: Extend the validation**

Widen `validateTargetClasses` to also load the source class for each mapping and compare sort orders. Because the function currently takes only a flat `classIds` array, change its shape to take pairs:

```typescript
async function validateTargetClasses(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    academicYearId: number;
    pairs: Array<{ fromClassId: number; toClassId: number }>;
  }
): Promise<{ ok: true } | { ok: false; error: "INVALID_TARGET_CLASS" | "INVALID_GRADE_PROGRESSION" }> {
  if (params.pairs.length === 0) return { ok: true };

  const targetIds = [...new Set(params.pairs.map((p) => p.toClassId))];
  const targets = await prisma.class.findMany({
    where: {
      id: { in: targetIds },
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      archived: false,
    },
    include: { grade: true },
  });
  if (targets.length !== targetIds.length) return { ok: false, error: "INVALID_TARGET_CLASS" };
  const targetById = new Map(targets.map((c) => [c.id, c]));

  const sourceIds = [...new Set(params.pairs.map((p) => p.fromClassId))];
  const sources = await prisma.class.findMany({
    where: { id: { in: sourceIds }, schoolId: params.schoolId },
    include: { grade: true },
  });
  const sourceById = new Map(sources.map((c) => [c.id, c]));

  for (const pair of params.pairs) {
    const from = sourceById.get(pair.fromClassId);
    const to = targetById.get(pair.toClassId);
    if (!from || !to) return { ok: false, error: "INVALID_TARGET_CLASS" };

    const step = to.grade.sortOrder - from.grade.sortOrder;
    if (step < 0 || step > 1) return { ok: false, error: "INVALID_GRADE_PROGRESSION" };
  }

  return { ok: true };
}
```

`step === 0` is retention and `step === 1` is promotion; anything else is rejected. Returning a `Result` rather than a boolean lets the caller distinguish the two rejections.

Update both call sites — `updateMappings` and `applyDecisions` — to build pairs and to propagate whichever error comes back. In `applyDecisions` the source class is `enrollment.classId`, which the resolved entries already carry as `fromClassId`.

- [ ] **Step 4: Pre-fill the mappings**

In `startPromotionRun`, the mapping rows are created with `toClassId: null` (`promotion.ts:63`). Infer instead: for each source class, find a class in the target year whose grade's `sortOrder` is exactly one higher and whose section matches. Fall back to `null` when none exists.

```typescript
  const targetClasses = await prisma.class.findMany({
    where: { schoolId: params.schoolId, academicYearId: toYear.id, archived: false },
    include: { grade: true },
  });
  const sourceClasses = await prisma.class.findMany({
    where: { id: { in: classesWithEnrollments.map((c) => c.id) } },
    include: { grade: true },
  });
  const sourceGradeOrder = new Map(sourceClasses.map((c) => [c.id, c.grade.sortOrder]));

  function inferTarget(fromClassId: number, section: string): number | null {
    const order = sourceGradeOrder.get(fromClassId);
    if (order === undefined) return null;
    const match = targetClasses.find(
      (c) => c.grade.sortOrder === order + 1 && c.section === section
    );
    return match?.id ?? null;
  }
```

Use `inferTarget(klass.id, klass.section)` where the mapping data is built. Matching on section as well as grade keeps 5A students together into 6A; when no 6A exists the admin still picks manually.

- [ ] **Step 5: Map the new error in the route**

Add an `INVALID_GRADE_PROGRESSION` 400 branch to the mappings route with the message "A class can only be promoted into the next grade up, or retained in the same grade".

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-engine.test.ts`

- [ ] **Step 7: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/lib/promotion.ts src/app tests
git commit -m "feat(promotion): assert grade progression and infer mappings"
```

---

### Task 5: Student admission-record fields

A standard admission form has nowhere to put half its data. `Student` today is name, dob, admission number, status, photo, gender, student id and date of join.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`Student`)
- Create: migration
- Modify: `apps/web/src/lib/school-setup/students.ts` (create and edit accept the fields)
- Test: `apps/web/tests/students-lib.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
it("stores the full admission record", async () => {
  const result = await createStudent(prisma, schoolId, activeYearId, {
    name: "Full Record",
    dob: "2015-01-01",
    classId,
    admissionNo: "FULL-001",
    address: "12 Example Road, Kochi",
    bloodGroup: "O+",
    nationality: "Indian",
    religion: "Hindu",
    previousSchool: "Little Flower LP",
    emergencyContactName: "Aunt",
    emergencyContactPhone: "+919876543210",
    category: "General",
    admissionDate: "2026-04-01",
    parents: [{ relationship: "Guardian", name: "Parent", phone: "+10000000060" }],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const student = await prisma.student.findUniqueOrThrow({ where: { id: result.id } });
  expect(student.address).toBe("12 Example Road, Kochi");
  expect(student.bloodGroup).toBe("O+");
  expect(student.previousSchool).toBe("Little Flower LP");
  expect(student.emergencyContactPhone).toBe("+919876543210");
  expect(student.admissionDate?.toISOString().slice(0, 10)).toBe("2026-04-01");
});

it("still creates a student when the optional fields are omitted", async () => {
  const result = await createStudent(prisma, schoolId, activeYearId, {
    name: "Minimal",
    dob: "2015-01-01",
    classId,
    admissionNo: "MIN-001",
    parents: [{ relationship: "Guardian", name: "Parent", phone: "+10000000061" }],
  });

  expect(result.ok).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/students-lib.test.ts -t "full admission record"`

- [ ] **Step 3: Add the columns**

All nullable — no school has this data yet, and a required column would break every existing fixture:

```prisma
  address               String?
  bloodGroup            String?
  nationality           String?
  religion              String?
  previousSchool        String?
  emergencyContactName  String?
  emergencyContactPhone String?
  category              String?
  admissionDate         DateTime?
```

`admissionDate` is deliberately distinct from the existing `dateOfJoin`: the audit lists both, and they differ for a student admitted in March who starts in June.

`category` is a free string rather than an enum. Reservation categories vary by state and change by policy; an enum here would need a migration every time a state adds one.

Migrate as before.

- [ ] **Step 4: Thread through create and edit**

Add each field to `createStudent`'s `input` type and `editStudent`'s `fields` type, all optional, and to the two `data` objects. `admissionDate` needs `input.admissionDate ? new Date(input.admissionDate) : null`, matching how `dateOfJoin` is already handled.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/students-lib.test.ts tests/students-api.test.ts`

- [ ] **Step 6: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 7: Commit**

```bash
git add prisma src/lib/school-setup/students.ts tests
git commit -m "feat(students): add admission record fields"
```

---

### Task 6: Staff HR fields

Staff records are name, phone and role only — no HR data of any kind. `User.email` exists but no form exposes it (Phase 7b).

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`User`)
- Create: migration
- Modify: `apps/web/src/lib/school-setup/staff.ts`
- Test: `apps/web/tests/staff-lib.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
it("stores the full staff record", async () => {
  const result = await createStaff(prisma, schoolId, {
    name: "Full Staff",
    phone: "+10000000070",
    role: "teacher",
    email: "staff@example.com",
    qualification: "M.Sc. Mathematics, B.Ed.",
    designation: "Senior Teacher",
    joiningDate: "2020-06-01",
    salary: 45000,
    address: "5 Example Lane",
    photoUrl: "https://example.test/photo.jpg",
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.id } });
  expect(user.qualification).toBe("M.Sc. Mathematics, B.Ed.");
  expect(user.designation).toBe("Senior Teacher");
  expect(Number(user.salary)).toBe(45000);
  expect(user.joiningDate?.toISOString().slice(0, 10)).toBe("2020-06-01");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/staff-lib.test.ts -t "full staff record"`

- [ ] **Step 3: Add the columns**

```prisma
  qualification String?
  designation   String?
  joiningDate   DateTime?
  salary        Decimal?  @db.Decimal(12, 2)
  address       String?
  photoUrl      String?
```

`salary` is `Decimal`, matching the money decision from Phase 5 — if that phase has not landed, use `Decimal` here anyway; money is never a `Float`.

If Phase 5 has landed, import and use `formatMoney` wherever salary is displayed.

Migrate as before.

- [ ] **Step 4: Thread through create and edit**

Same pattern as Task 5 — optional in both input types, mapped into both `data` objects.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/staff-lib.test.ts tests/staff-api.test.ts`

- [ ] **Step 6: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 7: Commit**

```bash
git add prisma src/lib/school-setup/staff.ts tests
git commit -m "feat(staff): add HR record fields"
```

---

### Task 7: Subject, Class, Assignment, SyllabusVersion, School and Notification fields

The remaining rows of the audit's missing-fields table. Grouped into one task because each is a small nullable-or-defaulted addition to a different model, and splitting them would mean six migrations over six tables for no isolation benefit.

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: migration
- Modify: the corresponding service modules
- Test: the corresponding lib tests

**Interfaces:**

```prisma
// Subject
  code           String?
  creditHours    Float?
  weeklyPeriods  Int?
  isPractical    Boolean @default(false)
  isElective     Boolean @default(false)

// Class
  capacity Int?
  room     String?

// Assignment
  maxMarks       Float?
  submissionUrl  String?
  submissionName String?
  gradedScore    Float?

// SyllabusVersion
  effectiveFrom DateTime?
  isCurrent     Boolean @default(false)

// School
  address       String?
  phone         String?
  email         String?
  principalName String?

// Notification
  channel        String  @default("in_app")
  deliveryStatus String  @default("created")
```

- [ ] **Step 1: Write the failing tests**

Two behaviours here are more than a column and need real tests. The rest are storage-only and are covered by one round-trip assertion each.

```typescript
it("refuses to enrol a student beyond the class capacity", async () => {
  await prisma.class.update({ where: { id: classId }, data: { capacity: 1 } });
  await createStudent(prisma, schoolId, activeYearId, {
    name: "First", dob: "2015-01-01", classId, admissionNo: "CAP-001",
    parents: [{ relationship: "Guardian", name: "P", phone: "+10000000080" }],
  });

  const result = await createStudent(prisma, schoolId, activeYearId, {
    name: "Second", dob: "2015-01-01", classId, admissionNo: "CAP-002",
    parents: [{ relationship: "Guardian", name: "P", phone: "+10000000081" }],
  });

  expect(result).toEqual({ ok: false, error: "CLASS_FULL" });
});

it("allows enrolment when no capacity is set", async () => {
  // capacity is null by default — no limit
  const result = await createStudent(prisma, schoolId, activeYearId, {
    name: "Unlimited", dob: "2015-01-01", classId, admissionNo: "CAP-003",
    parents: [{ relationship: "Guardian", name: "P", phone: "+10000000082" }],
  });

  expect(result.ok).toBe(true);
});

it("marks the newest syllabus version as current and clears the previous one", async () => {
  const first = await createSyllabusVersion(prisma, { subjectId, schoolId, title: "V1", content: "...", createdById: adminId });
  expect(first.ok).toBe(true);

  const second = await createSyllabusVersion(prisma, { subjectId, schoolId, title: "V2", content: "...", createdById: adminId });
  expect(second.ok).toBe(true);

  const versions = await prisma.syllabusVersion.findMany({ where: { subjectId }, orderBy: { versionNum: "asc" } });
  expect(versions[0].isCurrent).toBe(false);
  expect(versions[1].isCurrent).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/students-lib.test.ts -t "class capacity"`

- [ ] **Step 3: Add every column and migrate**

Add all of the above, then `npx prisma migrate dev --create-only --name remaining_missing_fields`, read the SQL, delete any stray `DROP INDEX` line, apply.

- [ ] **Step 4: Enforce capacity**

In `createStudent` and in `editStudent`'s class-reassignment branch, after the target class is resolved:

```typescript
  if (targetClass.capacity !== null) {
    const enrolled = await prisma.enrollment.count({
      where: { classId: targetClass.id, academicYearId, status: "active" },
    });
    if (enrolled >= targetClass.capacity) return { ok: false, error: "CLASS_FULL" };
  }
```

Add `CLASS_FULL` to both result unions and map it to a 400.

A null capacity means no limit, which is why every existing class keeps working.

- [ ] **Step 5: Maintain `isCurrent`**

In `createSyllabusVersion`, wrap the create in a transaction that first clears the flag on the subject's other versions:

```typescript
  await prisma.$transaction(async (tx) => {
    await tx.syllabusVersion.updateMany({
      where: { subjectId: params.subjectId, isCurrent: true },
      data: { isCurrent: false },
    });
    await tx.syllabusVersion.create({
      data: { /* ...existing fields..., */ isCurrent: true },
    });
  });
```

This replaces "current means highest version number" with an explicit pointer, which is what the audit asks for. It does not make syllabus year-scoped — that is a deferred decision.

- [ ] **Step 6: Thread the storage-only fields through their service modules**

`Subject`, `Class`, `Assignment`, `School` and `Notification` fields go into their respective create/edit inputs as optional parameters. Write one round-trip test per model asserting the value is stored and read back.

`Notification.channel` and `deliveryStatus` are written with their defaults and read by nothing yet — that is expected, and stated in the scope note.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -20`

- [ ] **Step 8: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 9: Commit**

```bash
git add prisma src/lib tests
git commit -m "feat(schema): add remaining missing fields across six models"
```

---

### Task 8: Widen `Gender` and make `relationship` an enum

`Gender` is `male | female` and the field is nullable, so the only way to represent anyone else is to leave it blank. `ParentStudent.relationship` is a free string defaulting to `"Guardian"` — typos will fragment any reporting on guardianship.

**Files:**
- Modify: `apps/web/prisma/schema.prisma:71-74`, `:221-231`
- Create: migration
- Modify: `apps/web/src/lib/school-setup/students.ts` (both gender unions and the parent input)
- Test: `apps/web/tests/students-lib.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
it("accepts a third gender value", async () => {
  const result = await createStudent(prisma, schoolId, activeYearId, {
    name: "Third", dob: "2015-01-01", classId, admissionNo: "G-001", gender: "other",
    parents: [{ relationship: "guardian", name: "P", phone: "+10000000090" }],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const student = await prisma.student.findUniqueOrThrow({ where: { id: result.id } });
  expect(student.gender).toBe("other");
});

it("rejects a relationship outside the enum", async () => {
  await expect(
    prisma.parentStudent.create({
      data: { parentUserId, studentId, relationship: "Uncle's Neighbour" as never },
    })
  ).rejects.toThrow();
});

it("accepts each enum relationship", async () => {
  const result = await createStudent(prisma, schoolId, activeYearId, {
    name: "Rel", dob: "2015-01-01", classId, admissionNo: "R-001",
    parents: [
      { relationship: "father", name: "Dad", phone: "+10000000091" },
      { relationship: "mother", name: "Mum", phone: "+10000000092" },
    ],
  });

  expect(result.ok).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/students-lib.test.ts -t "third gender"`

- [ ] **Step 3: Change the enums**

```prisma
enum Gender {
  male
  female
  other
}

enum GuardianRelationship {
  father
  mother
  guardian
  grandparent
  sibling
  other
}
```

and in `ParentStudent`:

```prisma
  relationship GuardianRelationship @default(guardian)
```

`other` on `Gender` rather than a longer list: the field stays nullable for "prefer not to say", and `other` covers everyone the binary excludes without the schema making claims it cannot keep current.

- [ ] **Step 4: Migrate**

The `relationship` change is a `String` → enum conversion, which Prisma will emit as a drop-and-recreate that loses data. There is no live data, so accept it, but write the note:

```sql
-- Converts ParentStudent.relationship from String to the GuardianRelationship
-- enum. Existing values are NOT migrated — the column is dropped and recreated
-- with the default. No live data as of 2026-08-22. A real migration would map
-- lower(trim(relationship)) onto the enum with a fallback to 'guardian'.
```

Then `npx prisma migrate reset --force && npm run prisma:migrate:test`.

- [ ] **Step 5: Update the service layer**

Both `gender?: "male" | "female"` unions in `students.ts` (create at `:154`, edit at `:288`) become `gender?: "male" | "female" | "other"`. The `parents[].relationship` type becomes `GuardianRelationship` imported from `@prisma/client`.

Update `prisma/fixtures.ts` and `prisma/seed.ts`, which pass `"Guardian"` with a capital G — the enum value is lowercase `guardian`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/students-lib.test.ts tests/students-api.test.ts tests/parent-login.test.ts`

- [ ] **Step 7: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib tests
git commit -m "feat(schema): widen Gender and make relationship an enum"
```

---

### Task 9: The `Assignment.dueDate` index

The last of the audit's index gaps. `Attendance.date` landed in Phase 3, `FeePayment.paidDate` in Phase 5, `Exam.examDate` in Phase 4.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`Assignment`)
- Create: migration

- [ ] **Step 1: Add the index**

```prisma
  @@index([dueDate])
```

- [ ] **Step 2: Migrate**

Run `npx prisma migrate dev --create-only --name assignment_duedate_index`, read the SQL, delete any stray `DROP INDEX "AcademicYear_schoolId_active_key"` line, apply, `npm run prisma:migrate:test`.

- [ ] **Step 3: Verify all four index gaps are closed**

```bash
grep -n "@@index(\[date\])" prisma/schema.prisma      # Attendance
grep -n "@@index(\[paidDate\])" prisma/schema.prisma  # FeePayment
grep -n "@@index(\[examDate\])" prisma/schema.prisma  # Exam
grep -n "@@index(\[dueDate\])" prisma/schema.prisma   # Assignment
```

All four must return a line. Any that does not means its phase did not land the index — go back and add it there rather than here.

- [ ] **Step 4: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add prisma
git commit -m "perf(assignments): index dueDate"
```

---

## Phase 7a Exit Criteria

- [ ] `grep -c '^model ' prisma/schema.prisma`, `grep -c 'createdAt DateTime'` and `grep -c 'updatedAt DateTime'` all print 27.
- [ ] Changing a student's attendance from present to absent writes a `RecordCorrection` naming the previous value and the actor; marking the same value twice writes nothing.
- [ ] Grades sort numerically everywhere — "Grade 2" before "Grade 10" in the grades list, the class list and every dropdown.
- [ ] A promotion mapping into a lower grade or skipping a grade is refused; retention in the same grade is accepted.
- [ ] Starting a promotion run pre-fills each mapping with the matching next-grade section where one exists.
- [ ] A student can be created with every admission field, and with none of them.
- [ ] A staff member can be created with every HR field, salary stored as `Decimal`.
- [ ] Enrolment into a class at capacity is refused; a class with null capacity has no limit.
- [ ] The newest syllabus version carries `isCurrent: true` and the previous one does not.
- [ ] `gender: "other"` is accepted; an off-enum relationship is rejected by the database.
- [ ] All four index gaps are closed.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm test`, `npm run seed` all clean.

## What Phase 7a deliberately leaves open

- **None of this is in a form yet.** That is Phase 7b, and it is the whole reason for the 7a/7b split.
- **`Mark.gradePoint` stays null.** Needs the deferred grading scheme.
- **`Notification.channel` and `deliveryStatus` are written with defaults and read by nothing.** There is no delivery pipeline to report into; SMS sending lives in a separate path entirely.
- **`Subject.isElective` is stored but not honoured.** Every enrolled student still implicitly takes every subject in their grade. Making electives real needs a student-subject join table, which is a feature.
- **`Assignment.submissionUrl` is stored but nothing uploads to it.** Phase 7b adds no student-facing upload — students have no login in this system.
