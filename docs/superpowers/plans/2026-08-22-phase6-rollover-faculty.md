# Phase 6: Rollover and Faculty Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a promoted school operational on day one of the new year by cloning classes, faculty, timetable and fee structures into it, and stop staff deactivation from silently destroying faculty assignments while leaving orphaned timetable rows behind — finding H6 plus the two faculty-lifecycle gaps from the audit's flow verdicts.

**Architecture:** Six sequential tasks. Tasks 1–4 build the rollover as four independently-tested clone steps in dependency order — classes, then faculty, then timetable, then fee structures — behind one entry point with per-entity opt-out. Tasks 5–6 fix the staff-deactivation cascade and archived-class staffing. Each task lands as its own commit.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 (real-Postgres integration tests, `fileParallelism: false`), TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 6).

## Hard dependency: Phase 3 must have landed

Rollover creates rows in the target year, and `revertPromotionRun` is what removes them if a promotion is undone. Before Phase 3, that revert deletes **every** enrollment in the target year rather than only the run's, and its year reactivation is unguarded. Building clone logic on top of that produces a revert that discards rows the clone created, in a way no test in this plan would catch.

Verify before starting:

```bash
git log --oneline --grep="H3" -- apps/web/src/lib/promotion.ts
```

Expect three commits (H3.1, H3.2, H3.3). If they are absent, stop and run Phase 3 first.

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` clean after every task; previously-passing tests stay green. Record the baseline before Task 1.
- Discriminated-union `Result` types; new error codes are **additive**.
- Tests import `{ prisma, resetDb }` from `./helpers/db`, `await resetDb()` in `beforeEach`.
- Failing test first, always.
- **No migration in this phase.** Every change is service-layer or UI. If a task appears to need a schema change, it has been misread.
- `tests/promotion-engine.test.ts` is extended, never restructured — Phases 1 and 3 also extend it.

## Two properties every clone step must have

Both are asserted by tests in every task below, and both are easy to lose.

**Idempotent.** Re-running rollover against a partially-populated target year adds only what is missing. An admin who runs it, adds a class by hand, then runs it again must not get a duplicate or a crash. Every step therefore checks for an existing row before creating, keyed on the natural unique constraint rather than on the source row's id.

**Transactional with the confirm.** Rollover runs inside `confirmPromotionRun`'s existing `$transaction`, not after it. A rollover that half-completes and commits leaves a year that is worse than an empty one, because the admin cannot tell what is missing.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `src/lib/promotion/rollover.ts` | **New** — the four clone steps and their orchestrator |
| `src/lib/promotion.ts` | `confirmPromotionRun` calls the orchestrator inside its transaction |
| `src/lib/school-setup/staff.ts` | Deactivation preserves assignments; reactivation restores them |
| `src/lib/school-setup/class-teachers.ts` | Reject archived classes |
| `src/components/academic-years/PromotionWizard.tsx` | Per-entity rollover opt-out |

`rollover.ts` is a new file rather than more lines in `promotion.ts`, which is already the largest service module in the codebase. Four clone functions plus an orchestrator is a coherent unit with one responsibility, and keeping it separate means the promotion engine's own tests and the rollover's do not have to share a fixture.

---

- [ ] **Task 0: Establish the baseline**

Run: `npm test 2>&1 | tail -20` and record the passing count. Confirm the Phase 3 dependency above.

---

### Task 1: Clone classes into the target year

`confirmPromotionRun`'s transaction (`promotion.ts:352-404`) touches `AcademicYear`, `Enrollment`, `Student`, `PromotionLogEntry` and `PromotionRun` — and nothing else. No `Class` rows are created for the new year, so a promotion enrolls students into classes that must already have been built by hand. In practice the admin builds them first, which is why the defect has never blocked anyone — but it means the promotion wizard cannot offer a target class until the admin has done manual setup, and Task 2–4's clones have nowhere to attach.

**Files:**
- Create: `apps/web/src/lib/promotion/rollover.ts`
- Test: `apps/web/tests/promotion-rollover.test.ts` (create)

**Interfaces:**
- Produces: `cloneClasses(tx, { schoolId, fromAcademicYearId, toAcademicYearId }): Promise<Map<number, number>>` — returns a map from source class id to target class id, consumed by Tasks 2, 3 and 4.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { cloneClasses } from "../src/lib/promotion/rollover";

describe("rollover: classes", () => {
  let schoolId: number;
  let fromYearId: number;
  let toYearId: number;
  let gradeId: number;

  beforeEach(async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Rollover School" } });
    schoolId = school.id;
    const fromYear = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
    });
    fromYearId = fromYear.id;
    const toYear = await prisma.academicYear.create({
      data: { schoolId, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
    });
    toYearId = toYear.id;
    const grade = await prisma.grade.create({ data: { schoolId, name: "Grade 1" } });
    gradeId = grade.id;
  });

  it("creates one class in the target year per class in the source year", async () => {
    await prisma.class.createMany({
      data: [
        { schoolId, gradeId, section: "A", academicYearId: fromYearId },
        { schoolId, gradeId, section: "B", academicYearId: fromYearId },
      ],
    });

    const map = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    const cloned = await prisma.class.findMany({
      where: { academicYearId: toYearId },
      orderBy: { section: "asc" },
    });
    expect(cloned.map((c) => c.section)).toEqual(["A", "B"]);
    expect(cloned.every((c) => c.gradeId === gradeId && c.archived === false)).toBe(true);
    expect(map.size).toBe(2);
  });

  it("is idempotent", async () => {
    await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });

    await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
    await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(await prisma.class.count({ where: { academicYearId: toYearId } })).toBe(1);
  });

  it("adopts a class the admin already created by hand", async () => {
    const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    const manual = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: toYearId } });

    const map = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    expect(await prisma.class.count({ where: { academicYearId: toYearId } })).toBe(1);
    expect(map.get(source.id)).toBe(manual.id);
  });

  it("skips archived source classes", async () => {
    await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
    await prisma.class.create({ data: { schoolId, gradeId, section: "Z", academicYearId: fromYearId, archived: true } });

    await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

    const sections = (await prisma.class.findMany({ where: { academicYearId: toYearId } })).map((c) => c.section);
    expect(sections).toEqual(["A"]);
  });
});
```

The third test is the important one. Adopting an existing class rather than failing on the `@@unique([gradeId, section, academicYearId])` constraint is what makes rollover safe to re-run, and returning the *existing* id in the map is what lets Tasks 2–4 attach to it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-rollover.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement `cloneClasses`**

Create `apps/web/src/lib/promotion/rollover.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";

/**
 * Every clone step takes a `PrismaClient`-shaped client so it can run either
 * standalone or inside an interactive transaction. Pass `tx` from within
 * `confirmPromotionRun`; pass `prisma` from tests.
 */
export async function cloneClasses(
  prisma: PrismaClient,
  params: { schoolId: number; fromAcademicYearId: number; toAcademicYearId: number }
): Promise<Map<number, number>> {
  const sourceClasses = await prisma.class.findMany({
    where: { schoolId: params.schoolId, academicYearId: params.fromAcademicYearId, archived: false },
  });

  const existing = await prisma.class.findMany({
    where: { schoolId: params.schoolId, academicYearId: params.toAcademicYearId },
  });
  const existingByKey = new Map(existing.map((c) => [`${c.gradeId}:${c.section}`, c.id]));

  const map = new Map<number, number>();

  for (const source of sourceClasses) {
    const key = `${source.gradeId}:${source.section}`;
    const already = existingByKey.get(key);
    if (already !== undefined) {
      map.set(source.id, already);
      continue;
    }

    const created = await prisma.class.create({
      data: {
        schoolId: params.schoolId,
        gradeId: source.gradeId,
        section: source.section,
        academicYearId: params.toAcademicYearId,
        archived: false,
      },
    });
    existingByKey.set(key, created.id);
    map.set(source.id, created.id);
  }

  return map;
}
```

The `gradeId:section` key mirrors the database's `@@unique([gradeId, section, academicYearId])` exactly. Keying on anything else — the source class id, the grade name — makes idempotence a coincidence rather than a guarantee.

Archived source classes are skipped because they represent a section the school has closed. Carrying them forward would resurrect it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-rollover.test.ts`

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/lib/promotion/rollover.ts tests/promotion-rollover.test.ts
git commit -m "feat(rollover): clone classes into the target academic year"
```

---

### Task 2: Clone faculty assignments

Without this, the new year has classes and no teachers — and because `createAssignment`, `enterMarks`, `markAttendance` and `createTimetableEntry` all gate on a `ClassTeacher` row, nothing works at all until an admin rebuilds every assignment by hand.

**Files:**
- Modify: `apps/web/src/lib/promotion/rollover.ts`
- Test: `apps/web/tests/promotion-rollover.test.ts` (extend)

**Interfaces:**
- Consumes: the class map from `cloneClasses`.
- Produces: `cloneFaculty(prisma, { classMap, fromAcademicYearId, toAcademicYearId }): Promise<{ cloned: number; skippedInactive: number }>`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("clones faculty assignments onto the cloned classes", async () => {
  const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
  const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
  const teacher = await prisma.user.create({
    data: { schoolId, phone: "+10000000201", role: "teacher", name: "Maths Teacher" },
  });
  await prisma.classTeacher.create({
    data: { classId: source.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: fromYearId, isClassTeacher: true },
  });

  const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
  const result = await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

  expect(result).toEqual({ cloned: 1, skippedInactive: 0 });

  const cloned = await prisma.classTeacher.findFirstOrThrow({ where: { academicYearId: toYearId } });
  expect(cloned.classId).toBe(classMap.get(source.id));
  expect(cloned.teacherUserId).toBe(teacher.id);
  expect(cloned.subjectId).toBe(subject.id);
  expect(cloned.isClassTeacher).toBe(true);
});

it("skips assignments whose teacher is no longer active, and reports them", async () => {
  const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
  const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
  const leaver = await prisma.user.create({
    data: { schoolId, phone: "+10000000202", role: "teacher", name: "Departed", status: "inactive" },
  });
  await prisma.classTeacher.create({
    data: { classId: source.id, subjectId: subject.id, teacherUserId: leaver.id, academicYearId: fromYearId },
  });

  const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
  const result = await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

  expect(result).toEqual({ cloned: 0, skippedInactive: 1 });
  expect(await prisma.classTeacher.count({ where: { academicYearId: toYearId } })).toBe(0);
});

it("is idempotent", async () => {
  const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
  const subject = await prisma.subject.create({ data: { gradeId, name: "Mathematics" } });
  const teacher = await prisma.user.create({
    data: { schoolId, phone: "+10000000203", role: "teacher", name: "Maths Teacher" },
  });
  await prisma.classTeacher.create({
    data: { classId: source.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: fromYearId },
  });

  const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
  await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
  await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

  expect(await prisma.classTeacher.count({ where: { academicYearId: toYearId } })).toBe(1);
});
```

Reporting `skippedInactive` rather than silently dropping is what lets the wizard tell the admin "3 assignments were not carried forward because those teachers have left" — which is the difference between a useful rollover and a mysterious one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-rollover.test.ts -t "clones faculty"`

- [ ] **Step 3: Implement `cloneFaculty`**

```typescript
export async function cloneFaculty(
  prisma: PrismaClient,
  params: {
    classMap: Map<number, number>;
    fromAcademicYearId: number;
    toAcademicYearId: number;
  }
): Promise<{ cloned: number; skippedInactive: number }> {
  const sourceLinks = await prisma.classTeacher.findMany({
    where: {
      academicYearId: params.fromAcademicYearId,
      classId: { in: [...params.classMap.keys()] },
    },
    include: { teacher: true },
  });

  const existing = await prisma.classTeacher.findMany({
    where: { academicYearId: params.toAcademicYearId },
  });
  const existingKeys = new Set(
    existing.map((l) => `${l.classId}:${l.teacherUserId}:${l.subjectId}`)
  );

  let cloned = 0;
  let skippedInactive = 0;

  for (const link of sourceLinks) {
    if (link.teacher.status !== "active") {
      skippedInactive += 1;
      continue;
    }

    const targetClassId = params.classMap.get(link.classId);
    if (targetClassId === undefined) continue;

    const key = `${targetClassId}:${link.teacherUserId}:${link.subjectId}`;
    if (existingKeys.has(key)) continue;

    await prisma.classTeacher.create({
      data: {
        classId: targetClassId,
        teacherUserId: link.teacherUserId,
        subjectId: link.subjectId,
        academicYearId: params.toAcademicYearId,
        isClassTeacher: link.isClassTeacher,
      },
    });
    existingKeys.add(key);
    cloned += 1;
  }

  return { cloned, skippedInactive };
}
```

The dedupe key mirrors `@@unique([classId, teacherUserId, subjectId, academicYearId])`, minus the year which is fixed. `isClassTeacher` carries forward — the homeroom teacher of Grade 1A stays the homeroom teacher of next year's Grade 1A unless an admin changes it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-rollover.test.ts`

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/lib/promotion/rollover.ts tests/promotion-rollover.test.ts
git commit -m "feat(rollover): clone faculty assignments into the target year"
```

---

### Task 3: Clone the timetable

**Files:**
- Modify: `apps/web/src/lib/promotion/rollover.ts`
- Test: `apps/web/tests/promotion-rollover.test.ts` (extend)

**Interfaces:**
- Consumes: the class map from Task 1 and the faculty rows created by Task 2.
- Produces: `cloneTimetable(prisma, { classMap, fromAcademicYearId, toAcademicYearId }): Promise<{ cloned: number; skippedNoTeacher: number }>`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("clones timetable entries onto the cloned classes", async () => {
  // ...source class + subject + teacher + ClassTeacher link + Period + TimetableEntry
  const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
  await cloneFaculty(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
  const result = await cloneTimetable(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

  expect(result).toEqual({ cloned: 1, skippedNoTeacher: 0 });

  const cloned = await prisma.timetableEntry.findFirstOrThrow({ where: { academicYearId: toYearId } });
  expect(cloned.classId).toBe(classMap.get(sourceClassId));
  expect(cloned.periodId).toBe(periodId);
  expect(cloned.dayOfWeek).toBe(1);
  expect(cloned.teacherUserId).toBe(teacherId);
});

it("clears the teacher when their assignment did not carry forward", async () => {
  // ...same, but the teacher is inactive so cloneFaculty skipped them
  const result = await cloneTimetable(prisma, { classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

  expect(result).toEqual({ cloned: 1, skippedNoTeacher: 1 });

  const cloned = await prisma.timetableEntry.findFirstOrThrow({ where: { academicYearId: toYearId } });
  expect(cloned.teacherUserId).toBeNull();
});

it("is idempotent", async () => {
  // ...run cloneTimetable twice
  expect(await prisma.timetableEntry.count({ where: { academicYearId: toYearId } })).toBe(1);
});
```

The second test is the interesting case. A timetable slot whose teacher has left must survive as an unstaffed slot — `TimetableEntry.teacherUserId` is nullable precisely for this — rather than being dropped. Dropping it would silently shrink the new year's timetable.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-rollover.test.ts -t "clones timetable"`

- [ ] **Step 3: Implement `cloneTimetable`**

```typescript
export async function cloneTimetable(
  prisma: PrismaClient,
  params: {
    classMap: Map<number, number>;
    fromAcademicYearId: number;
    toAcademicYearId: number;
  }
): Promise<{ cloned: number; skippedNoTeacher: number }> {
  const sourceEntries = await prisma.timetableEntry.findMany({
    where: {
      academicYearId: params.fromAcademicYearId,
      classId: { in: [...params.classMap.keys()] },
    },
  });

  const targetFaculty = await prisma.classTeacher.findMany({
    where: { academicYearId: params.toAcademicYearId },
  });
  const facultyKeys = new Set(
    targetFaculty.map((l) => `${l.classId}:${l.teacherUserId}:${l.subjectId}`)
  );

  const existing = await prisma.timetableEntry.findMany({
    where: { academicYearId: params.toAcademicYearId },
  });
  const existingKeys = new Set(
    existing.map((e) => `${e.classId}:${e.dayOfWeek}:${e.periodId}`)
  );

  let cloned = 0;
  let skippedNoTeacher = 0;

  for (const entry of sourceEntries) {
    const targetClassId = params.classMap.get(entry.classId);
    if (targetClassId === undefined) continue;

    const key = `${targetClassId}:${entry.dayOfWeek}:${entry.periodId}`;
    if (existingKeys.has(key)) continue;

    let teacherUserId: number | null = entry.teacherUserId;
    if (
      teacherUserId !== null &&
      !facultyKeys.has(`${targetClassId}:${teacherUserId}:${entry.subjectId}`)
    ) {
      teacherUserId = null;
      skippedNoTeacher += 1;
    }

    await prisma.timetableEntry.create({
      data: {
        classId: targetClassId,
        academicYearId: params.toAcademicYearId,
        dayOfWeek: entry.dayOfWeek,
        periodId: entry.periodId,
        subjectId: entry.subjectId,
        teacherUserId,
      },
    });
    existingKeys.add(key);
    cloned += 1;
  }

  return { cloned, skippedNoTeacher };
}
```

Checking `facultyKeys` before carrying the teacher over is what keeps the clone consistent with `createTimetableEntry`'s own `INVALID_TEACHER` rule — a cloned entry must satisfy the same invariant a hand-created one would.

`periodId` is carried unchanged. `Period` is school-scoped and year-agnostic, so the same periods apply to the new year. This is also why Phase 1's `INVALID_PERIOD` check does not need re-running here: the source entry's period already belongs to this school.

The teacher double-booking unique index (`@@unique([teacherUserId, dayOfWeek, periodId, academicYearId])`) is satisfied automatically, because the source year's entries already satisfied the same constraint and the clone preserves the day/period/teacher triple exactly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-rollover.test.ts`

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/lib/promotion/rollover.ts tests/promotion-rollover.test.ts
git commit -m "feat(rollover): clone the timetable into the target year"
```

---

### Task 4: Clone fee structures and wire rollover into confirm

**Files:**
- Modify: `apps/web/src/lib/promotion/rollover.ts` (add `cloneFeeStructures` and `runRollover`)
- Modify: `apps/web/src/lib/promotion.ts` (`confirmPromotionRun`)
- Modify: `apps/web/src/components/academic-years/PromotionWizard.tsx`
- Test: `apps/web/tests/promotion-rollover.test.ts`, `tests/promotion-engine.test.ts`

**Interfaces:**
- Produces: `cloneFeeStructures(prisma, { schoolId, classMap, fromAcademicYearId, toAcademicYearId }): Promise<{ cloned: number }>`.
- Produces: `RolloverOptions = { classes: boolean; faculty: boolean; timetable: boolean; feeStructures: boolean }`.
- Produces: `runRollover(prisma, { schoolId, fromAcademicYearId, toAcademicYearId, options }): Promise<RolloverSummary>`.
- Produces: `confirmPromotionRun` params gain `rollover?: RolloverOptions`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("clones fee structures with their due dates shifted by a year", async () => {
  const source = await prisma.class.create({ data: { schoolId, gradeId, section: "A", academicYearId: fromYearId } });
  await prisma.feeStructure.create({
    data: { schoolId, academicYearId: fromYearId, classId: source.id, term: "Term 1", amount: 5000, dueDate: new Date("2026-06-01") },
  });

  const classMap = await cloneClasses(prisma, { schoolId, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });
  const result = await cloneFeeStructures(prisma, { schoolId, classMap, fromAcademicYearId: fromYearId, toAcademicYearId: toYearId });

  expect(result).toEqual({ cloned: 1 });

  const cloned = await prisma.feeStructure.findFirstOrThrow({ where: { academicYearId: toYearId } });
  expect(cloned.term).toBe("Term 1");
  expect(Number(cloned.amount)).toBe(5000);
  expect(cloned.dueDate.toISOString().slice(0, 10)).toBe("2027-06-01");
});

it("honours per-entity opt-out", async () => {
  // ...source year with classes, faculty, timetable and fee structures
  const summary = await runRollover(prisma, {
    schoolId,
    fromAcademicYearId: fromYearId,
    toAcademicYearId: toYearId,
    options: { classes: true, faculty: true, timetable: false, feeStructures: false },
  });

  expect(summary.classes).toBeGreaterThan(0);
  expect(summary.faculty.cloned).toBeGreaterThan(0);
  expect(await prisma.timetableEntry.count({ where: { academicYearId: toYearId } })).toBe(0);
  expect(await prisma.feeStructure.count({ where: { academicYearId: toYearId } })).toBe(0);
});

it("does nothing at all when every option is off", async () => {
  const summary = await runRollover(prisma, {
    schoolId,
    fromAcademicYearId: fromYearId,
    toAcademicYearId: toYearId,
    options: { classes: false, faculty: false, timetable: false, feeStructures: false },
  });

  expect(summary.classes).toBe(0);
  expect(await prisma.class.count({ where: { academicYearId: toYearId } })).toBe(0);
});
```

In `tests/promotion-engine.test.ts`:

```typescript
it("leaves the new year operational after a confirmed promotion with rollover", async () => {
  // ...a source year with classes, faculty and timetable; a drafted run with decisions applied
  const result = await confirmPromotionRun(prisma, {
    promotionRunId: runId,
    schoolId,
    rollover: { classes: true, faculty: true, timetable: true, feeStructures: true },
  });

  expect(result).toEqual({ ok: true });
  expect(await prisma.class.count({ where: { academicYearId: toYearId } })).toBeGreaterThan(0);
  expect(await prisma.classTeacher.count({ where: { academicYearId: toYearId } })).toBeGreaterThan(0);
  expect(await prisma.timetableEntry.count({ where: { academicYearId: toYearId } })).toBeGreaterThan(0);
});

it("confirms without rollover when no options are passed", async () => {
  const result = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId });
  expect(result).toEqual({ ok: true });
  expect(await prisma.classTeacher.count({ where: { academicYearId: toYearId } })).toBe(0);
});
```

The second is the backward-compatibility guard: `rollover` is optional, and every existing confirm test must keep passing unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-rollover.test.ts -t "fee structures"`

- [ ] **Step 3: Implement `cloneFeeStructures`**

```typescript
export async function cloneFeeStructures(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    classMap: Map<number, number>;
    fromAcademicYearId: number;
    toAcademicYearId: number;
  }
): Promise<{ cloned: number }> {
  const sourceStructures = await prisma.feeStructure.findMany({
    where: {
      academicYearId: params.fromAcademicYearId,
      classId: { in: [...params.classMap.keys()] },
    },
  });

  const existing = await prisma.feeStructure.findMany({
    where: { academicYearId: params.toAcademicYearId },
  });
  const existingKeys = new Set(existing.map((f) => `${f.classId}:${f.term}`));

  let cloned = 0;

  for (const source of sourceStructures) {
    const targetClassId = params.classMap.get(source.classId);
    if (targetClassId === undefined) continue;

    const key = `${targetClassId}:${source.term}`;
    if (existingKeys.has(key)) continue;

    const dueDate = new Date(source.dueDate);
    dueDate.setFullYear(dueDate.getFullYear() + 1);

    await prisma.feeStructure.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.toAcademicYearId,
        classId: targetClassId,
        term: source.term,
        amount: source.amount,
        dueDate,
      },
    });
    existingKeys.add(key);
    cloned += 1;
  }

  return { cloned };
}
```

Shifting the due date by exactly one year is a heuristic — a school whose terms move will need to edit them — but carrying last year's dates forward unchanged would mark every cloned fee `overdue` the moment Phase 5's date-aware status runs.

If Phase 5 has landed, also carry `discount` and `fineAmount`. If it has not, those columns do not exist yet and this code is correct as written.

`FeeStructure` has no unique constraint on `(classId, term)`, so the dedupe key here is a convention rather than something the database enforces. That is worth knowing but not worth adding a constraint for in this phase.

- [ ] **Step 4: Implement `runRollover`**

```typescript
export interface RolloverOptions {
  classes: boolean;
  faculty: boolean;
  timetable: boolean;
  feeStructures: boolean;
}

export interface RolloverSummary {
  classes: number;
  faculty: { cloned: number; skippedInactive: number };
  timetable: { cloned: number; skippedNoTeacher: number };
  feeStructures: number;
}

export async function runRollover(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    fromAcademicYearId: number;
    toAcademicYearId: number;
    options: RolloverOptions;
  }
): Promise<RolloverSummary> {
  const summary: RolloverSummary = {
    classes: 0,
    faculty: { cloned: 0, skippedInactive: 0 },
    timetable: { cloned: 0, skippedNoTeacher: 0 },
    feeStructures: 0,
  };

  if (!params.options.classes) return summary;

  const classMap = await cloneClasses(prisma, {
    schoolId: params.schoolId,
    fromAcademicYearId: params.fromAcademicYearId,
    toAcademicYearId: params.toAcademicYearId,
  });
  summary.classes = classMap.size;

  if (params.options.faculty) {
    summary.faculty = await cloneFaculty(prisma, {
      classMap,
      fromAcademicYearId: params.fromAcademicYearId,
      toAcademicYearId: params.toAcademicYearId,
    });
  }

  if (params.options.timetable) {
    summary.timetable = await cloneTimetable(prisma, {
      classMap,
      fromAcademicYearId: params.fromAcademicYearId,
      toAcademicYearId: params.toAcademicYearId,
    });
  }

  if (params.options.feeStructures) {
    const result = await cloneFeeStructures(prisma, {
      schoolId: params.schoolId,
      classMap,
      fromAcademicYearId: params.fromAcademicYearId,
      toAcademicYearId: params.toAcademicYearId,
    });
    summary.feeStructures = result.cloned;
  }

  return summary;
}
```

`classes: false` short-circuits everything, because faculty, timetable and fee structures all hang off the class map. That is a real constraint, not an arbitrary one — surface it in the UI by disabling the other three checkboxes when Classes is unchecked, rather than letting an admin pick an impossible combination.

- [ ] **Step 5: Call it from `confirmPromotionRun`**

Add `rollover?: RolloverOptions` to the params. Inside the existing `$transaction`, after the year status updates and before the per-student loop:

```typescript
    if (params.rollover) {
      await runRollover(tx as PrismaClient, {
        schoolId: params.schoolId,
        fromAcademicYearId: run.fromAcademicYearId,
        toAcademicYearId: run.toAcademicYearId,
        options: params.rollover,
      });
    }
```

Before the student loop matters: the loop creates `Enrollment` rows pointing at target classes, and if rollover is what creates those classes they must exist first.

Interactive transactions have a default timeout (5s in Prisma 5.20). A large school's rollover plus a full promotion may exceed it. Raise it on this transaction:

```typescript
  await prisma.$transaction(async (tx) => { /* ... */ }, { timeout: 30_000 });
```

- [ ] **Step 6: Add the wizard controls**

In `PromotionWizard.tsx`, add four checkboxes on the confirm step, all defaulting to checked, with Faculty/Timetable/Fee structures disabled when Classes is unchecked. Send the object as `rollover` in the confirm request. Show the returned summary — "12 classes, 38 faculty assignments (2 skipped: teacher inactive), 210 timetable entries (2 unstaffed), 4 fee structures" — so the admin can see what happened.

Widen the confirm route to accept and forward the `rollover` body field.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-rollover.test.ts tests/promotion-engine.test.ts`

Expected: PASS, including all pre-existing confirm and both revert branches.

- [ ] **Step 8: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 9: Verify the revert interaction by hand**

This is the Phase 3 dependency made concrete. In a scratch test or a REPL: confirm a run with rollover on, then revert it. The rollover's classes, faculty and timetable rows **stay** — revert undoes enrollments and year status, not structural setup — and no enrollment outside the run is touched. If revert deletes rows the rollover created, Phase 3's Task 4 has not landed.

Write this up as a test in `tests/promotion-rollover.test.ts` rather than leaving it as a manual check:

```typescript
it("survives a revert of the promotion that created it", async () => {
  // ...confirm with rollover, then revert
  expect(await prisma.class.count({ where: { academicYearId: toYearId } })).toBeGreaterThan(0);
  expect(await prisma.classTeacher.count({ where: { academicYearId: toYearId } })).toBeGreaterThan(0);
});
```

Note that this test will fail the `YEAR_HAS_ACTIVITY` guard, because rollover creates `ClassTeacher` and `TimetableEntry` rows in the target year and the guard counts exactly those. **That is correct behaviour and the test must assert it**: once a school has begun setting up the new year, reverting the promotion is no longer safe automatically. Assert `{ ok: false, error: "YEAR_HAS_ACTIVITY" }` and document the interaction. Do not weaken the guard to make rollover revertible.

- [ ] **Step 10: Commit**

```bash
git add src/lib/promotion/rollover.ts src/lib/promotion.ts src/components src/app tests
git commit -m "feat(rollover): clone fee structures and wire rollover into confirm (H6)"
```

---

### Task 5: Stop deactivation from destroying faculty assignments

`deactivateStaff` (`staff.ts:240-247`) hard-deletes the teacher's `ClassTeacher` rows for the active year inside its transaction, and `activateStaff` (`staff.ts:254-262`) restores nothing — it flips `status` back to `active` and stops. Deactivating a teacher for a week therefore permanently destroys their timetable position and every subject assignment, and the admin must rebuild them from memory.

Their `TimetableEntry` rows are left untouched, so a deactivated teacher disappears from faculty lists while still appearing on the printed timetable.

**Files:**
- Modify: `apps/web/src/lib/school-setup/staff.ts:231-262`
- Test: `apps/web/tests/staff-lib.test.ts` (confirm the filename with `ls tests | grep -i staff`)

**Interfaces:**
- No signature changes. The behaviour of both functions changes.

- [ ] **Step 1: Write the failing tests**

```typescript
it("preserves faculty assignments across deactivate and reactivate", async () => {
  await prisma.classTeacher.create({
    data: { classId, subjectId, teacherUserId: teacherId, academicYearId: yearId, isClassTeacher: true },
  });

  const off = await deactivateStaff(prisma, {
    userId: teacherId,
    schoolId,
    requestingUserId: adminId,
    academicYearId: yearId,
  });
  expect(off).toEqual({ ok: true });

  const on = await activateStaff(prisma, { userId: teacherId, schoolId });
  expect(on).toEqual({ ok: true });

  const link = await prisma.classTeacher.findFirst({
    where: { teacherUserId: teacherId, academicYearId: yearId },
  });
  expect(link).not.toBeNull();
  expect(link?.isClassTeacher).toBe(true);
});

it("clears the teacher from their timetable rows on deactivation", async () => {
  await prisma.classTeacher.create({
    data: { classId, subjectId, teacherUserId: teacherId, academicYearId: yearId },
  });
  const entry = await prisma.timetableEntry.create({
    data: { classId, academicYearId: yearId, dayOfWeek: 1, periodId, subjectId, teacherUserId: teacherId },
  });

  await deactivateStaff(prisma, { userId: teacherId, schoolId, requestingUserId: adminId, academicYearId: yearId });

  const after = await prisma.timetableEntry.findUniqueOrThrow({ where: { id: entry.id } });
  expect(after.teacherUserId).toBeNull();
});

it("restores the teacher onto their timetable rows on reactivation", async () => {
  await prisma.classTeacher.create({
    data: { classId, subjectId, teacherUserId: teacherId, academicYearId: yearId },
  });
  const entry = await prisma.timetableEntry.create({
    data: { classId, academicYearId: yearId, dayOfWeek: 1, periodId, subjectId, teacherUserId: teacherId },
  });

  await deactivateStaff(prisma, { userId: teacherId, schoolId, requestingUserId: adminId, academicYearId: yearId });
  await activateStaff(prisma, { userId: teacherId, schoolId });

  const after = await prisma.timetableEntry.findUniqueOrThrow({ where: { id: entry.id } });
  expect(after.teacherUserId).toBe(teacherId);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/staff-lib.test.ts -t "preserves faculty assignments"`

Expected: FAIL — the link is gone after deactivation and is never restored.

- [ ] **Step 3: Stop deleting, start clearing**

Replace `deactivateStaff`'s transaction body:

```typescript
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: params.userId }, data: { status: "inactive" } });
    if (params.academicYearId) {
      // Faculty assignments are KEPT. `assignTeacherToSubject` already refuses to
      // create new ones for an inactive teacher (Phase 1), and every read path that
      // offers a teacher filters on status — so keeping the rows costs nothing and
      // makes reactivation lossless.
      await tx.timetableEntry.updateMany({
        where: { teacherUserId: params.userId, academicYearId: params.academicYearId },
        data: { teacherUserId: null },
      });
    }
  });
```

The `classTeacher.deleteMany` is removed entirely. Clearing the timetable rows rather than deleting them keeps the slot on the grid as unstaffed, which is what an admin needs to see.

- [ ] **Step 4: Restore on reactivation**

```typescript
export async function activateStaff(
  prisma: PrismaClient,
  params: { userId: number; schoolId: number; academicYearId?: number | null }
): Promise<ActivateStaffResult> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, schoolId: params.schoolId },
  });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: params.userId }, data: { status: "active" } });

    if (params.academicYearId) {
      const links = await tx.classTeacher.findMany({
        where: { teacherUserId: params.userId, academicYearId: params.academicYearId },
      });

      for (const link of links) {
        await tx.timetableEntry.updateMany({
          where: {
            classId: link.classId,
            subjectId: link.subjectId,
            academicYearId: params.academicYearId,
            teacherUserId: null,
          },
          data: { teacherUserId: params.userId },
        });
      }
    }
  });

  return { ok: true };
}
```

`academicYearId` is a new optional parameter — update the caller to pass the active year.

The restore is deliberately conservative: it fills only slots that are **still unstaffed** for a class/subject this teacher is assigned. If another teacher was put into the slot while this one was away, that assignment wins. This also means the restore cannot violate the double-booking unique index, because it never displaces an existing occupant.

One accepted imprecision: if two teachers assigned to the same class and subject are both deactivated and both reactivated, the first to be reactivated takes all the unstaffed slots. Getting this exactly right would need a record of which teacher held which slot, which is a new table for a rare case. Note it in the code comment and move on.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/staff-lib.test.ts tests/class-teachers-lib.test.ts tests/timetable-lib.test.ts`

- [ ] **Step 6: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/lib/school-setup/staff.ts src/app tests
git commit -m "fix(staff): preserve faculty assignments across deactivation"
```

---

### Task 6: Reject staffing an archived class

`assignTeacherToSubject` (`class-teachers.ts:49-50`) resolves the class by `{ id, schoolId }` and never checks `archived`. A closed section can still be staffed.

**Files:**
- Modify: `apps/web/src/lib/school-setup/class-teachers.ts:49-50`
- Test: `apps/web/tests/class-teachers-lib.test.ts` (extend)

**Interfaces:**
- Produces: `AssignResult` gains `| { ok: false; error: "CLASS_ARCHIVED" }`.

- [ ] **Step 1: Write the failing test**

```typescript
it("refuses to staff an archived class", async () => {
  const archived = await prisma.class.create({
    data: { schoolId, gradeId, section: "Z", academicYearId: yearId, archived: true },
  });

  const result = await assignTeacherToSubject(prisma, {
    classId: archived.id,
    schoolId,
    subjectId,
    teacherUserId: teacherId,
  });

  expect(result).toEqual({ ok: false, error: "CLASS_ARCHIVED" });
  expect(await prisma.classTeacher.count({ where: { classId: archived.id } })).toBe(0);
});
```

The test needs `gradeId` in scope — check the file's `beforeEach` and add it if absent.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/class-teachers-lib.test.ts -t "archived class"`

- [ ] **Step 3: Add the check**

Extend the result union, then split the class lookup:

```typescript
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) return { ok: false, error: "INVALID_CLASS" };
  if (klass.archived) return { ok: false, error: "CLASS_ARCHIVED" };
```

Distinct from `INVALID_CLASS` so the admin is told the class exists but is closed, rather than being sent hunting for a missing record.

- [ ] **Step 4: Map the error in the route**

`grep -rl "assignTeacherToSubject" src/app/api` and add a 400 with "That class is archived".

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/class-teachers-lib.test.ts`

- [ ] **Step 6: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/lib/school-setup/class-teachers.ts src/app tests
git commit -m "fix(faculty): reject staffing an archived class"
```

---

## Phase 6 Exit Criteria

- [ ] Confirming a promotion with rollover enabled leaves the target year with classes, faculty, timetable and fee structures — verified by counting rows in each table.
- [ ] Rollover is idempotent: running it twice produces the same row counts as running it once.
- [ ] Rollover adopts classes an admin created by hand rather than failing on the unique constraint.
- [ ] A teacher who left is skipped, reported in the summary, and their timetable slots are cloned unstaffed rather than dropped.
- [ ] Per-entity opt-out works, and unchecking Classes disables the other three in the UI.
- [ ] `confirmPromotionRun` without a `rollover` argument behaves exactly as before — every pre-existing confirm test passes unchanged.
- [ ] Reverting a promotion whose rollover has run returns `YEAR_HAS_ACTIVITY`, and this is asserted by a test rather than discovered later.
- [ ] Deactivating and reactivating a teacher is lossless for faculty assignments, and their timetable slots empty and refill.
- [ ] An archived class cannot be staffed.
- [ ] `git diff main --stat -- apps/web/prisma/` shows no change from this phase.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm test` all clean.

## What Phase 6 deliberately leaves open

- **Rollover makes a promotion irreversible.** Once cloned faculty and timetable rows exist in the target year, `YEAR_HAS_ACTIVITY` blocks the revert. That is the correct trade-off — a school that has begun setting up the new year should not be able to unwind it with one click — but it means the admin must be told, in the wizard, that confirming with rollover is a one-way step. Add that copy; do not weaken the guard.
- **Two-teacher restore ambiguity.** Documented in Task 5. A slot-ownership record would fix it and is not worth a table.
- **Fee due dates shift by exactly one year.** A heuristic. A school whose term dates move must edit them.
- **Students are not cloned.** Enrollments come from the promotion itself, which is correct — rollover copies structure, not people.
