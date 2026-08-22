# Phase 1: Close the Unvalidated Writes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every code path where a client-supplied foreign key reaches a database write without a lookup constraining it to the caller's tenant, academic year or grade — findings C1, C2, C3, H4, H5 and the inactive-teacher gap from *The Broken Seam* (21 Aug 2026).

**Architecture:** Seven independent, sequential tasks, each scoped to one narrow slice of `apps/web/src/lib/**` or `apps/web/src/components/**`. Every defect has the same shape and the same fix: resolve the incoming ID with a `findFirst` carrying the full constraint set, and return a new discriminated-union error code on miss. **No Prisma migration is written in this phase** — if a task appears to need a schema change, the task has been misread. Each task lands as its own commit.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 (real-Postgres integration tests, `fileParallelism: false`), TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 1).

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` must be clean after every task.
- All currently-passing tests must stay green. Establish the baseline count before Task 1 and compare after each task.
- Service functions return discriminated-union `Result` types: `{ ok: true, ... } | { ok: false, error: "CODE" }`. New error codes are **additive** — never change the shape of an existing `ok: false` branch that callers already match on.
- Multi-step writes go through `prisma.$transaction`.
- Tests are real-Postgres integration tests under `apps/web/tests/`, importing `{ prisma, resetDb }` from `./helpers/db`, calling `await resetDb()` in `beforeEach`.
- Every task writes its failing test **first** and runs it to confirm it fails for the right reason before writing any implementation.
- No task fixes findings outside its own scope.
- **No migration in this phase.** `prisma/schema.prisma` is not modified.

## Three corrections to the audit, already applied to these tasks

The audit was written on branch `claude/field-gaps-flow-analysis-659842`. Reading the current tree turned up three inaccuracies. Each changes what a task must do, so do not "fix" the tasks back toward the audit text.

1. **C2 has a second write path.** The audit names only `updateMappings` (`promotion.ts:119`). `applyDecisions` also accepts a client `decision.toClassId` and resolves it at `promotion.ts:245` with no lookup. Task 3 covers both; a fix confined to `updateMappings` leaves the hole open.

2. **H4's "same omission on edit" does not exist, and the clash query is already scoped.** `editTimetableEntry` accepts only `{ subjectId, teacherUserId }` — it never takes a `periodId`, so there is nothing to school-scope there. And the double-booking clash query filters on `academicYearId`, which belongs to exactly one school, so a cross-school false clash is already impossible. **The only real defect in H4 is that `createTimetableEntry` never resolves `periodId` at all.** Task 5 is correspondingly smaller than the audit implies.

3. **H5's `SubjectOption` does not carry `gradeId`.** The audit says the type "already carries `gradeId`; it is simply never used." The runtime data does — `listAllSubjects` returns `{ id, name, gradeId }` (`subjects.ts:142`) — but the component's `SubjectOption` interface (`TimetableView.tsx:12-15`) declares only `{ id, name }`, dropping it at the type boundary. Task 7 must widen the interface, not just add a filter.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `src/lib/assignments.ts` | New shared `assertTeacherOwnsSubject` helper; `editAssignment` and `updateAssignmentStatuses` both call it |
| `src/lib/promotion.ts` | New shared `validateTargetClasses` helper; `updateMappings` and `applyDecisions` both call it |
| `src/lib/school-setup/students.ts` | Two `findFirst` filters gain `academicYearId` |
| `src/lib/timetable.ts` | `createTimetableEntry` resolves `periodId` |
| `src/lib/school-setup/class-teachers.ts` | `assignTeacherToSubject` rejects inactive teachers |
| `src/components/timetable/TimetableView.tsx` | `SubjectOption` gains `gradeId`; dropdowns filter by selected class |
| `src/app/api/assignments/[id]/route.ts` | Maps the new `INVALID_SUBJECT` error to a 403 |
| `src/app/api/promotion-runs/[id]/mappings/route.ts` | Maps the new `INVALID_TARGET_CLASS` error to a 400 |

---

- [ ] **Task 0: Establish the baseline**

Before touching anything, record the passing-test count so later tasks can prove they broke nothing.

Run: `npm test 2>&1 | tail -20`

Write the "N passed" number into your working notes. If the suite is not fully green at this point, **stop and report** — a red baseline invalidates every "tests still pass" claim in this plan.

---

### Task 1: `editAssignment` re-runs the create-path subject check (C1)

`createAssignment` (`assignments.ts:103-111`) requires a matching `ClassTeacher` row before accepting a subject. `editAssignment` performs no subject lookup at all — `assignments.ts:201` is a bare `data.subjectId = params.fields.subjectId`, and the route forwards the request body untouched. The only surviving check is the foreign key's existence constraint, which is satisfied by **any** subject row in the database, including one belonging to a different school.

Extract the check into a shared helper so the two paths cannot drift again.

**Files:**
- Modify: `apps/web/src/lib/assignments.ts` (add helper; `editAssignment` at `:166-207`)
- Modify: `apps/web/src/app/api/assignments/[id]/route.ts:48-57`
- Test: `apps/web/tests/assignments-lib.test.ts` (extend)

**Interfaces:**
- Produces: `assertTeacherOwnsSubject(prisma, { classId, subjectId, teacherUserId, academicYearId }): Promise<boolean>` — used again by Task 2.
- Produces: `EditAssignmentResult` gains `| { ok: false; error: "INVALID_SUBJECT" }`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/assignments-lib.test.ts`. This test needs a second school, so build it explicitly rather than reusing the file's shared fixture.

```typescript
it("rejects an edit that moves the assignment to another school's subject", async () => {
  const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
  const otherGrade = await prisma.grade.create({
    data: { schoolId: otherSchool.id, name: "Grade 1" },
  });
  const otherSubject = await prisma.subject.create({
    data: { gradeId: otherGrade.id, name: "Foreign Maths" },
  });

  const created = await createAssignment(prisma, {
    classId,
    teacherUserId: teacherId,
    subjectId,
    title: "Original",
    dueDate: "2026-09-01",
    academicYearId: yearId,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await editAssignment(prisma, {
    assignmentId: created.id,
    teacherUserId: teacherId,
    schoolId,
    fields: { subjectId: otherSubject.id },
  });

  expect(result).toEqual({ ok: false, error: "INVALID_SUBJECT" });

  const unchanged = await prisma.assignment.findUnique({ where: { id: created.id } });
  expect(unchanged?.subjectId).toBe(subjectId);
});

it("rejects an edit to a same-school subject the teacher is not assigned", async () => {
  const strangerSubject = await prisma.subject.create({
    data: { gradeId, name: "Unassigned Subject" },
  });

  const created = await createAssignment(prisma, {
    classId,
    teacherUserId: teacherId,
    subjectId,
    title: "Original",
    dueDate: "2026-09-01",
    academicYearId: yearId,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await editAssignment(prisma, {
    assignmentId: created.id,
    teacherUserId: teacherId,
    schoolId,
    fields: { subjectId: strangerSubject.id },
  });

  expect(result).toEqual({ ok: false, error: "INVALID_SUBJECT" });
});

it("allows an edit to a subject the teacher is assigned in the same class", async () => {
  const secondSubject = await prisma.subject.create({
    data: { gradeId, name: "Science" },
  });
  await prisma.classTeacher.create({
    data: { classId, subjectId: secondSubject.id, teacherUserId: teacherId, academicYearId: yearId },
  });

  const created = await createAssignment(prisma, {
    classId,
    teacherUserId: teacherId,
    subjectId,
    title: "Original",
    dueDate: "2026-09-01",
    academicYearId: yearId,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await editAssignment(prisma, {
    assignmentId: created.id,
    teacherUserId: teacherId,
    schoolId,
    fields: { subjectId: secondSubject.id },
  });

  expect(result).toEqual({ ok: true });
  const updated = await prisma.assignment.findUnique({ where: { id: created.id } });
  expect(updated?.subjectId).toBe(secondSubject.id);
});
```

If the file's `beforeEach` does not already expose `gradeId` as a variable, add it alongside the existing `subjectId`/`classId` declarations — the test above needs it. Check the top of the file before writing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/assignments-lib.test.ts -t "another school's subject"`

Expected: FAIL. The edit currently returns `{ ok: true }` and the assignment's `subjectId` is the foreign one, so both the result assertion and the `unchanged` assertion fail.

- [ ] **Step 3: Add the shared helper**

In `apps/web/src/lib/assignments.ts`, above `createAssignment`:

```typescript
async function assertTeacherOwnsSubject(
  prisma: PrismaClient,
  params: { classId: number; subjectId: number; teacherUserId: number; academicYearId: number }
): Promise<boolean> {
  const link = await prisma.classTeacher.findFirst({
    where: {
      classId: params.classId,
      subjectId: params.subjectId,
      teacherUserId: params.teacherUserId,
      academicYearId: params.academicYearId,
    },
  });
  return link !== null;
}
```

Then rewrite `createAssignment`'s existing inline check to use it, so there is exactly one copy of this query:

```typescript
  const owns = await assertTeacherOwnsSubject(prisma, {
    classId: params.classId,
    subjectId: params.subjectId,
    teacherUserId: params.teacherUserId,
    academicYearId: params.academicYearId,
  });
  if (!owns) return { ok: false, error: "NOT_ASSIGNED" };
```

This replaces the `const link = await prisma.classTeacher.findFirst({...}); if (!link) return ...` block at `assignments.ts:103-111`. `createAssignment`'s behaviour is unchanged — same query, same error code.

- [ ] **Step 4: Widen the result type and guard the edit**

In `apps/web/src/lib/assignments.ts`, extend the result union:

```typescript
export type EditAssignmentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "FORBIDDEN" }
  | { ok: false; error: "INVALID_SUBJECT" };
```

Then in `editAssignment`, replace the bare assignment at `:201` with a guarded one. Insert this immediately after the `FORBIDDEN` check and before the `data` object is built:

```typescript
  if (params.fields.subjectId !== undefined) {
    const owns = await assertTeacherOwnsSubject(prisma, {
      classId: assignment.classId,
      subjectId: params.fields.subjectId,
      teacherUserId: params.teacherUserId,
      academicYearId: assignment.academicYearId,
    });
    if (!owns) return { ok: false, error: "INVALID_SUBJECT" };
  }
```

Leave the `if (params.fields.subjectId !== undefined) data.subjectId = params.fields.subjectId;` line as it is — it now runs only after the guard has passed.

The `ClassTeacher` row is keyed on `classId`, and the class's `gradeId` constrains which subjects can have a `ClassTeacher` row at all (enforced by `assignTeacherToSubject` at `class-teachers.ts:52`). So this one check transitively covers school, grade and teacher-assignment — the same guarantee `createAssignment` provides.

- [ ] **Step 5: Map the new error in the route**

In `apps/web/src/app/api/assignments/[id]/route.ts`, the `if (!result.ok)` block currently returns 404 for `NOT_FOUND` and falls through to a 403 with a hardcoded "Only the teacher who created this assignment can edit it" message. That message would be wrong for `INVALID_SUBJECT`. Replace the block:

```typescript
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      if (result.error === "INVALID_SUBJECT") {
        return NextResponse.json(
          { error: "You are not assigned to that subject for this class" },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "Only the teacher who created this assignment can edit it" },
        { status: 403 }
      );
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/assignments-lib.test.ts`

Expected: PASS, including the three new tests and every pre-existing test in the file.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

Expected: clean typecheck; passing count is the Task 0 baseline plus 3.

- [ ] **Step 8: Commit**

```bash
git add src/lib/assignments.ts src/app/api/assignments/\[id\]/route.ts tests/assignments-lib.test.ts
git commit -m "fix(assignments): validate subject on edit (C1)"
```

---

### Task 2: Assignment status updates check the subject, not just the class

`updateAssignmentStatuses` (`assignments.ts:270-283`) verifies the teacher has a `ClassTeacher` row for the **class** — omitting `subjectId` from the query. A teacher who teaches Music to Grade 5A can therefore mark submissions on the Grade 5A Mathematics assignment. `getAssignmentStatuses` (`:239-247`) has the same gap on the read side.

Tighten both to the assignment's subject, reusing Task 1's helper.

**Files:**
- Modify: `apps/web/src/lib/assignments.ts:222-253` (`getAssignmentStatuses`), `:262-300` (`updateAssignmentStatuses`)
- Test: `apps/web/tests/assignments-lib.test.ts` (extend)

**Interfaces:**
- Consumes: `assertTeacherOwnsSubject` from Task 1.
- Produces: no new error codes — both functions already return `NOT_ASSIGNED`, which is the correct code for this rejection.

- [ ] **Step 1: Write the failing test**

```typescript
it("refuses status updates from a teacher who teaches the class but not the subject", async () => {
  const otherSubject = await prisma.subject.create({
    data: { gradeId, name: "Music" },
  });
  const musicTeacher = await prisma.user.create({
    data: { schoolId, phone: "+10000000099", role: "teacher", name: "Music Teacher" },
  });
  await prisma.classTeacher.create({
    data: { classId, subjectId: otherSubject.id, teacherUserId: musicTeacher.id, academicYearId: yearId },
  });

  const created = await createAssignment(prisma, {
    classId,
    teacherUserId: teacherId,
    subjectId,
    title: "Maths homework",
    dueDate: "2026-09-01",
    academicYearId: yearId,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await updateAssignmentStatuses(prisma, {
    assignmentId: created.id,
    schoolId,
    teacherUserId: musicTeacher.id,
    entries: [],
  });

  expect(result).toEqual({ ok: false, error: "NOT_ASSIGNED" });
});
```

Add `updateAssignmentStatuses` and `getAssignmentStatuses` to the file's import list if they are not already imported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/assignments-lib.test.ts -t "not the subject"`

Expected: FAIL — the music teacher's class-level `ClassTeacher` row satisfies the current query, so the call returns `{ ok: true }`.

- [ ] **Step 3: Tighten both functions**

In `getAssignmentStatuses`, replace the `if (params.role === "teacher")` block's inline query:

```typescript
  if (params.role === "teacher") {
    const owns = await assertTeacherOwnsSubject(prisma, {
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      teacherUserId: params.userId,
      academicYearId: assignment.academicYearId,
    });
    if (!owns) return { ok: false, error: "NOT_ASSIGNED" };
  }
```

In `updateAssignmentStatuses`, replace the equivalent block:

```typescript
  const owns = await assertTeacherOwnsSubject(prisma, {
    classId: assignment.classId,
    subjectId: assignment.subjectId,
    teacherUserId: params.teacherUserId,
    academicYearId: assignment.academicYearId,
  });
  if (!owns) return { ok: false, error: "NOT_ASSIGNED" };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/assignments-lib.test.ts tests/assignments-api.test.ts tests/assignment-roster.test.tsx`

Expected: PASS. If a pre-existing test now fails, read it before changing it — a fixture that assigned a teacher to the class but not the subject was relying on the bug, and the fixture is what needs the extra `ClassTeacher` row, not the implementation.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/lib/assignments.ts tests/assignments-lib.test.ts
git commit -m "fix(assignments): scope status permissions to the subject"
```

---

### Task 3: Validate `toClassId` on both promotion write paths (C2)

The most severe tenant-isolation gap in the audit. `updateMappings` carefully validates every `fromClassId` against the run (`promotion.ts:103-107`) and then writes `toClassId` straight through at `:119` with no check of school, target year, grade or archived state. `confirmPromotionRun` later uses that value directly to create `Enrollment` rows, so a School A admin can enroll School A's students into School B's class.

`applyDecisions` has the same hole on a different path: `decision.toClassId` arrives from the client and is resolved at `:245` as `decision.toClassId ?? mapping?.toClassId ?? null`, again with no lookup.

Both call one new helper.

**Files:**
- Modify: `apps/web/src/lib/promotion.ts` (add helper; `updateMappings` at `:88-124`, `applyDecisions` at `:203-277`)
- Modify: `apps/web/src/app/api/promotion-runs/[id]/mappings/route.ts`
- Test: `apps/web/tests/promotion-engine.test.ts` (extend — do not restructure; Phases 3 and 6 also extend this file)

**Interfaces:**
- Produces: `validateTargetClasses(prisma, { schoolId, academicYearId, classIds }): Promise<boolean>` — returns true only if every id resolves to a non-archived class in that school and year.
- Produces: `UpdateMappingsResult` and `SetDecisionsResult` each gain `| { ok: false; error: "INVALID_TARGET_CLASS" }`.

**Scope note — grade progression:** the audit suggests optionally asserting grade progression. `Grade` has no `sortOrder` column until Phase 7a, so "the next grade up" cannot be computed yet. This task asserts school, target year and non-archived only. Inferring and asserting progression is an explicit Phase 7a follow-up; do not attempt it here.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/tests/promotion-engine.test.ts`. Read the file's existing `beforeEach` first and reuse its fixture variables — the names below assume a run already exists with a valid `fromClassId`; adapt to whatever the file actually provides rather than duplicating setup.

```typescript
it("rejects a mapping whose target class belongs to another school", async () => {
  const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
  const otherYear = await prisma.academicYear.create({
    data: {
      schoolId: otherSchool.id,
      name: "2027-28",
      startDate: new Date("2027-04-01"),
      endDate: new Date("2028-03-31"),
      status: "upcoming",
    },
  });
  const otherGrade = await prisma.grade.create({
    data: { schoolId: otherSchool.id, name: "Grade 2" },
  });
  const foreignClass = await prisma.class.create({
    data: {
      schoolId: otherSchool.id,
      gradeId: otherGrade.id,
      section: "A",
      academicYearId: otherYear.id,
    },
  });

  const result = await updateMappings(prisma, {
    promotionRunId: runId,
    schoolId,
    mappings: [{ fromClassId, toClassId: foreignClass.id }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_TARGET_CLASS" });

  const stored = await prisma.promotionMapping.findFirst({
    where: { promotionRunId: runId, fromClassId },
  });
  expect(stored?.toClassId).not.toBe(foreignClass.id);
});

it("rejects a mapping whose target class is in the wrong academic year", async () => {
  const staleYear = await prisma.academicYear.create({
    data: {
      schoolId,
      name: "2024-25",
      startDate: new Date("2024-04-01"),
      endDate: new Date("2025-03-31"),
      status: "archived",
    },
  });
  const staleClass = await prisma.class.create({
    data: { schoolId, gradeId, section: "Z", academicYearId: staleYear.id },
  });

  const result = await updateMappings(prisma, {
    promotionRunId: runId,
    schoolId,
    mappings: [{ fromClassId, toClassId: staleClass.id }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_TARGET_CLASS" });
});

it("rejects a mapping whose target class is archived", async () => {
  const archivedClass = await prisma.class.create({
    data: { schoolId, gradeId, section: "Y", academicYearId: toYearId, archived: true },
  });

  const result = await updateMappings(prisma, {
    promotionRunId: runId,
    schoolId,
    mappings: [{ fromClassId, toClassId: archivedClass.id }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_TARGET_CLASS" });
});

it("rejects a decision whose toClassId belongs to another school", async () => {
  const otherSchool = await prisma.school.create({ data: { name: "Other School 2" } });
  const otherYear = await prisma.academicYear.create({
    data: {
      schoolId: otherSchool.id,
      name: "2027-28",
      startDate: new Date("2027-04-01"),
      endDate: new Date("2028-03-31"),
      status: "upcoming",
    },
  });
  const otherGrade = await prisma.grade.create({
    data: { schoolId: otherSchool.id, name: "Grade 2" },
  });
  const foreignClass = await prisma.class.create({
    data: {
      schoolId: otherSchool.id,
      gradeId: otherGrade.id,
      section: "A",
      academicYearId: otherYear.id,
    },
  });

  const result = await applyDecisions(prisma, {
    promotionRunId: runId,
    schoolId,
    decisions: [{ studentId, action: "promoted", toClassId: foreignClass.id }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_TARGET_CLASS" });

  const logged = await prisma.promotionLogEntry.findFirst({
    where: { promotionRunId: runId, studentId },
  });
  expect(logged?.toClassId ?? null).not.toBe(foreignClass.id);
});

it("still accepts a valid target class in the run's target year", async () => {
  const validClass = await prisma.class.create({
    data: { schoolId, gradeId, section: "B", academicYearId: toYearId },
  });

  const result = await updateMappings(prisma, {
    promotionRunId: runId,
    schoolId,
    mappings: [{ fromClassId, toClassId: validClass.id }],
  });

  expect(result).toEqual({ ok: true });
});
```

If the file's fixture does not expose `toYearId`, `gradeId` or `studentId` under those names, use whatever it does expose. Do not create a parallel fixture.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-engine.test.ts -t "another school"`

Expected: FAIL — `updateMappings` currently returns `{ ok: true }` and persists the foreign `toClassId`.

- [ ] **Step 3: Add the shared helper**

In `apps/web/src/lib/promotion.ts`, above `updateMappings`:

```typescript
async function validateTargetClasses(
  prisma: PrismaClient,
  params: { schoolId: number; academicYearId: number; classIds: number[] }
): Promise<boolean> {
  const distinct = [...new Set(params.classIds)];
  if (distinct.length === 0) return true;

  const found = await prisma.class.count({
    where: {
      id: { in: distinct },
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      archived: false,
    },
  });
  return found === distinct.length;
}
```

Counting distinct ids in one query keeps this O(1) round-trips regardless of how many mappings a run carries.

- [ ] **Step 4: Guard `updateMappings`**

Extend the result union:

```typescript
export type UpdateMappingsResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "ALREADY_CONFIRMED" }
  | { ok: false; error: "INVALID_MAPPING" }
  | { ok: false; error: "INVALID_TARGET_CLASS" };
```

Insert the check immediately after the existing `fromClassId` loop and before the `$transaction`:

```typescript
  const targetIds = params.mappings
    .map((mapping) => mapping.toClassId)
    .filter((id): id is number => id !== null);
  const targetsValid = await validateTargetClasses(prisma, {
    schoolId: params.schoolId,
    academicYearId: run.toAcademicYearId,
    classIds: targetIds,
  });
  if (!targetsValid) return { ok: false, error: "INVALID_TARGET_CLASS" };
```

`toClassId: null` is a legitimate value — it means "no target chosen yet" — so nulls are filtered out rather than rejected.

- [ ] **Step 5: Guard `applyDecisions`**

Extend `SetDecisionsResult` with the same additional branch:

```typescript
  | { ok: false; error: "INVALID_TARGET_CLASS" };
```

In `applyDecisions`, the `resolved` array is built by the existing `for (const decision of params.decisions)` loop and then written in a `$transaction`. Insert the check between the two — after the loop closes, before `await prisma.$transaction(`:

```typescript
  const resolvedTargets = resolved
    .map((entry) => entry.toClassId)
    .filter((id): id is number => id !== null);
  const decisionTargetsValid = await validateTargetClasses(prisma, {
    schoolId: params.schoolId,
    academicYearId: run.toAcademicYearId,
    classIds: resolvedTargets,
  });
  if (!decisionTargetsValid) return { ok: false, error: "INVALID_TARGET_CLASS" };
```

Validating `resolved` rather than the raw `params.decisions` is deliberate: it covers the client-supplied `decision.toClassId`, the mapping fallback, **and** the `retained` branch's `enrollment.classId`. The retained branch is the interesting one — it reuses the student's *current* class, which lives in the **source** year, so it would fail this check. Handle it by validating only entries whose action is `promoted`:

```typescript
  const resolvedTargets = resolved
    .filter((entry) => entry.action === "promoted")
    .map((entry) => entry.toClassId)
    .filter((id): id is number => id !== null);
```

Use this second version. A retained student staying in their existing class is correct behaviour and must not be rejected.

- [ ] **Step 6: Map the new error in the route**

In `apps/web/src/app/api/promotion-runs/[id]/mappings/route.ts`, add a branch to the error handling alongside the existing `INVALID_MAPPING` case, returning 400:

```typescript
      if (result.error === "INVALID_TARGET_CLASS") {
        return NextResponse.json(
          { error: "Target class must belong to this school and the target academic year" },
          { status: 400 }
        );
      }
```

Read the file's existing error block first and match its shape — if it uses a switch or a lookup map, extend that rather than bolting on an `if`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-engine.test.ts`

Expected: PASS — the five new tests plus all 731 lines of pre-existing coverage. The retained-student tests in the existing suite are the ones most likely to catch a mistake in Step 5; if one fails, the `action === "promoted"` filter is missing.

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 9: Commit**

```bash
git add src/lib/promotion.ts src/app/api/promotion-runs/\[id\]/mappings/route.ts tests/promotion-engine.test.ts
git commit -m "fix(promotion): validate toClassId on both write paths (C2)"
```

---

### Task 4: Year-scope the class lookup on student create and edit (C3)

`createStudent` takes `academicYearId` from the server (always the active year) but `classId` from the client, and validates the class against the school only (`students.ts:191`). `editStudent` repeats the omission at `:340-342`.

The result is the quietest defect in the audit. The enrollment is written successfully, but every downstream roster query filters on `classId` **and** `academicYearId` together, so a mismatched enrollment matches nothing: the student appears on no attendance sheet, no marks roster, no fee roster and no assignment list, with no error raised to the admin who created them.

**Files:**
- Modify: `apps/web/src/lib/school-setup/students.ts:191`, `:340-342`
- Test: `apps/web/tests/students-lib.test.ts` (extend — confirm the filename with `ls tests | grep -i student` first)

**Interfaces:**
- Produces: no new error codes. Both functions already return `INVALID_CLASS`, which is the correct code.

- [ ] **Step 1: Write the failing test**

```typescript
it("refuses to create a student against a class from a different academic year", async () => {
  const staleYear = await prisma.academicYear.create({
    data: {
      schoolId,
      name: "2025-26",
      startDate: new Date("2025-04-01"),
      endDate: new Date("2026-03-31"),
      status: "archived",
    },
  });
  const staleClass = await prisma.class.create({
    data: { schoolId, gradeId, section: "A", academicYearId: staleYear.id },
  });

  const result = await createStudent(prisma, schoolId, activeYearId, {
    name: "Ghost Student",
    dob: "2015-01-01",
    classId: staleClass.id,
    admissionNo: "GHOST-001",
    parents: [{ relationship: "Guardian", name: "Parent", phone: "+10000000042" }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_CLASS" });

  const orphan = await prisma.student.findUnique({ where: { admissionNo: "GHOST-001" } });
  expect(orphan).toBeNull();
  const enrollments = await prisma.enrollment.count({ where: { classId: staleClass.id } });
  expect(enrollments).toBe(0);
});

it("refuses to move a student into a class from a different academic year", async () => {
  const staleYear = await prisma.academicYear.create({
    data: {
      schoolId,
      name: "2025-26",
      startDate: new Date("2025-04-01"),
      endDate: new Date("2026-03-31"),
      status: "archived",
    },
  });
  const staleClass = await prisma.class.create({
    data: { schoolId, gradeId, section: "A", academicYearId: staleYear.id },
  });

  const created = await createStudent(prisma, schoolId, activeYearId, {
    name: "Real Student",
    dob: "2015-01-01",
    classId,
    admissionNo: "REAL-001",
    parents: [{ relationship: "Guardian", name: "Parent", phone: "+10000000043" }],
  });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await editStudent(prisma, {
    studentId: created.id,
    schoolId,
    academicYearId: activeYearId,
    fields: { classId: staleClass.id },
  });

  expect(result).toEqual({ ok: false, error: "INVALID_CLASS" });

  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId: created.id, academicYearId: activeYearId } },
  });
  expect(enrollment?.classId).toBe(classId);
});
```

Adapt fixture variable names (`activeYearId`, `gradeId`, `classId`) to whatever the existing file's `beforeEach` provides. `createStudent`'s success shape may be `{ ok: true, id }` — check the `CreateStudentResult` type and adjust the `created.id` reference if it differs.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/students-lib.test.ts -t "different academic year"`

Expected: FAIL — both calls currently succeed, and the first leaves an invisible student behind.

- [ ] **Step 3: Add the year filter to `createStudent`**

At `students.ts:191`, replace:

```typescript
  const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
```

with:

```typescript
  const targetClass = await prisma.class.findFirst({
    where: { id: input.classId, schoolId, academicYearId },
  });
```

`academicYearId` is already a parameter of `createStudent` — no signature change is needed.

- [ ] **Step 4: Add the year filter to `editStudent`**

At `students.ts:340-342`, replace:

```typescript
      const targetClass = await prisma.class.findFirst({
        where: { id: params.fields.classId, schoolId: params.schoolId },
      });
```

with:

```typescript
      const targetClass = await prisma.class.findFirst({
        where: {
          id: params.fields.classId,
          schoolId: params.schoolId,
          academicYearId: params.academicYearId,
        },
      });
```

This block is already inside the `if (params.fields.classId !== undefined || params.fields.rollNumber !== undefined)` guard, which returns `NO_ACTIVE_ENROLLMENT` when `params.academicYearId` is null — so by this line `params.academicYearId` is narrowed to `number` and TypeScript will accept it. If it does not narrow, the guard above it has been altered; do not add a non-null assertion, fix the guard.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/students-lib.test.ts tests/students-api.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/lib/school-setup/students.ts tests/students-lib.test.ts
git commit -m "fix(students): year-scope the class lookup on create and edit (C3)"
```

---

### Task 5: School-scope `periodId` and reject break periods (H4)

`createTimetableEntry` validates the class against the school, the day range, the subject against the class's grade, the teacher against a `ClassTeacher` row, and double-booking — and never touches `periodId`. The value goes straight into the write at `timetable.ts:105`. The foreign key alone carries no school context, so one school's timetable can reference another school's period definitions.

`Period` also carries `isBreak` (`schema.prisma:139`), and nothing stops a lesson being scheduled into a break.

**Read the second correction in the header before starting.** `editTimetableEntry` takes no `periodId` and needs no change, and the clash query is already school-scoped through `academicYearId`. This task touches `createTimetableEntry` only.

**Files:**
- Modify: `apps/web/src/lib/timetable.ts:53-65` (result union), `:67-124` (`createTimetableEntry`)
- Modify: `apps/web/src/app/api/timetable/route.ts` (error mapping — confirm the path with `ls src/app/api/timetable`)
- Test: `apps/web/tests/timetable-lib.test.ts` (confirm the filename with `ls tests | grep -i timetable`)

**Interfaces:**
- Produces: `CreateTimetableEntryResult` gains `| { ok: false; error: "INVALID_PERIOD" }` and `| { ok: false; error: "BREAK_PERIOD" }`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("rejects a period belonging to another school", async () => {
  const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
  const foreignPeriod = await prisma.period.create({
    data: {
      schoolId: otherSchool.id,
      order: 1,
      label: "Foreign Period 1",
      startTime: "09:00",
      endTime: "09:45",
    },
  });

  const result = await createTimetableEntry(prisma, {
    schoolId,
    academicYearId: yearId,
    classId,
    dayOfWeek: 1,
    periodId: foreignPeriod.id,
    subjectId,
  });

  expect(result).toEqual({ ok: false, error: "INVALID_PERIOD" });

  const written = await prisma.timetableEntry.count({ where: { periodId: foreignPeriod.id } });
  expect(written).toBe(0);
});

it("rejects scheduling a lesson into a break period", async () => {
  const breakPeriod = await prisma.period.create({
    data: {
      schoolId,
      order: 99,
      label: "Lunch",
      isBreak: true,
      startTime: "12:00",
      endTime: "12:45",
    },
  });

  const result = await createTimetableEntry(prisma, {
    schoolId,
    academicYearId: yearId,
    classId,
    dayOfWeek: 1,
    periodId: breakPeriod.id,
    subjectId,
  });

  expect(result).toEqual({ ok: false, error: "BREAK_PERIOD" });
});

it("still accepts a teaching period belonging to this school", async () => {
  const result = await createTimetableEntry(prisma, {
    schoolId,
    academicYearId: yearId,
    classId,
    dayOfWeek: 1,
    periodId,
    subjectId,
  });

  expect(result.ok).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/timetable-lib.test.ts -t "another school"`

Expected: FAIL — the entry is created against the foreign period and the count is 1.

- [ ] **Step 3: Widen the result type**

```typescript
export type CreateTimetableEntryResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_DAY" }
  | { ok: false; error: "INVALID_PERIOD" }
  | { ok: false; error: "BREAK_PERIOD" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "INVALID_TEACHER" }
  | { ok: false; error: "TEACHER_ALREADY_BOOKED" }
  | { ok: false; error: "DUPLICATE_SLOT" };
```

- [ ] **Step 4: Resolve the period**

In `createTimetableEntry`, insert immediately after the `INVALID_DAY` check and before the subject lookup:

```typescript
  const period = await prisma.period.findFirst({
    where: { id: params.periodId, schoolId: params.schoolId },
  });
  if (!period) return { ok: false, error: "INVALID_PERIOD" };
  if (period.isBreak) return { ok: false, error: "BREAK_PERIOD" };
```

Ordering matters: place it before the subject and teacher lookups so a caller probing with a foreign period id gets `INVALID_PERIOD` rather than leaking whether their subject guess was valid.

- [ ] **Step 5: Map the new errors in the route**

Find the timetable POST handler and add both codes to its error mapping, returning 400 for each:

```typescript
      if (result.error === "INVALID_PERIOD") {
        return NextResponse.json({ error: "Period not found" }, { status: 400 });
      }
      if (result.error === "BREAK_PERIOD") {
        return NextResponse.json({ error: "Cannot schedule a lesson during a break" }, { status: 400 });
      }
```

Match the surrounding block's existing style.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/timetable-lib.test.ts tests/timetable-api.test.ts`

Expected: PASS. A pre-existing test that creates a period without setting `isBreak` is unaffected — the column defaults to `false`.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/lib/timetable.ts src/app/api/timetable/route.ts tests/timetable-lib.test.ts
git commit -m "fix(timetable): school-scope periodId and reject break periods (H4)"
```

---

### Task 6: Reject inactive teachers in faculty assignment

`assignTeacherToSubject` (`class-teachers.ts:55`) checks `id`, `schoolId` and `role: "teacher"` — but not `status`. A deactivated teacher can still be assigned to a subject, and the admin UI offers them because its dropdown is built from all staff with `role === "teacher"` with no status filter.

Fix both layers in one task: the service check is the security boundary, the dropdown filter is what stops an admin hitting an avoidable error.

**Files:**
- Modify: `apps/web/src/lib/school-setup/class-teachers.ts:55-56`
- Modify: the faculty assignment component (find it with `grep -rl "assignTeacherToSubject\|/api/class-teachers" src/components src/app/dashboard`)
- Test: `apps/web/tests/class-teachers-lib.test.ts` (extend)

**Interfaces:**
- Produces: `AssignResult` gains `| { ok: false; error: "TEACHER_INACTIVE" }`.

Check the `UserStatus` enum at `prisma/schema.prisma:18` for the exact value names before writing the test — the code below assumes `active` / `inactive`.

- [ ] **Step 1: Write the failing test**

```typescript
it("refuses to assign a deactivated teacher", async () => {
  const inactiveTeacher = await prisma.user.create({
    data: {
      schoolId,
      phone: "+10000000077",
      role: "teacher",
      name: "Former Teacher",
      status: "inactive",
    },
  });

  const result = await assignTeacherToSubject(prisma, {
    classId,
    schoolId,
    subjectId,
    teacherUserId: inactiveTeacher.id,
  });

  expect(result).toEqual({ ok: false, error: "TEACHER_INACTIVE" });

  const written = await prisma.classTeacher.count({
    where: { teacherUserId: inactiveTeacher.id },
  });
  expect(written).toBe(0);
});

it("still assigns an active teacher", async () => {
  const result = await assignTeacherToSubject(prisma, {
    classId,
    schoolId,
    subjectId,
    teacherUserId: teacherId,
  });

  expect(result).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/class-teachers-lib.test.ts -t "deactivated teacher"`

Expected: FAIL — the assignment currently succeeds and the count is 1.

- [ ] **Step 3: Widen the result type and split the check**

```typescript
export type AssignResult =
  | { ok: true }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "INVALID_TEACHER" }
  | { ok: false; error: "TEACHER_INACTIVE" }
  | { ok: false; error: "ALREADY_ASSIGNED" };
```

Replace the single teacher lookup at `:55-56`:

```typescript
  const teacher = await prisma.user.findFirst({
    where: { id: params.teacherUserId, schoolId: params.schoolId, role: "teacher" },
  });
  if (!teacher) return { ok: false, error: "INVALID_TEACHER" };
  if (teacher.status !== "active") return { ok: false, error: "TEACHER_INACTIVE" };
```

Keeping the two rejections distinct is deliberate: `INVALID_TEACHER` means "no such teacher here" and `TEACHER_INACTIVE` means "that person exists but has left", and an admin needs to be told which.

- [ ] **Step 4: Filter the dropdown**

In the faculty assignment component located above, the teacher `<select>` is populated from a list filtered on `role === "teacher"`. Add the status condition to that same filter:

```typescript
staff.filter((s) => s.role === "teacher" && s.status === "active")
```

If the row type feeding the component has no `status` field, add it to the type and to the server-side query that builds the list — the column exists on `User`, it is simply not projected. Do not work around this by fetching status separately in the client.

- [ ] **Step 5: Map the new error in the route**

Find the class-teachers POST handler (`grep -rl "assignTeacherToSubject" src/app/api`) and add:

```typescript
      if (result.error === "TEACHER_INACTIVE") {
        return NextResponse.json(
          { error: "That teacher is deactivated and cannot be assigned" },
          { status: 400 }
        );
      }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/class-teachers-lib.test.ts`

Expected: PASS.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/lib/school-setup/class-teachers.ts src/components src/app tests/class-teachers-lib.test.ts
git commit -m "fix(faculty): reject inactive teachers on assignment"
```

---

### Task 7: Filter the timetable subject dropdown by grade (H5)

`TimetablePage` passes `listAllSubjects(prisma, claims.schoolId)` — every subject in the school — into `TimetableView`, which renders all of them in both the add and edit dropdowns. An admin building a Grade 10 timetable is offered Grade 1 subjects, and the (correct) server-side `INVALID_SUBJECT` check rejects the choice only after submission.

`AssignmentsView.tsx:73` already does this correctly and is the reference implementation:

```typescript
const selectedClass = classes.find((c) => String(c.id) === classId) ?? null;
const availableSubjects = selectedClass ? subjects.filter((s) => s.gradeId === selectedClass.gradeId) : [];
```

**Read the third correction in the header before starting.** `listAllSubjects` does return `gradeId` at runtime (`subjects.ts:142`), but `TimetableView`'s `SubjectOption` interface declares only `{ id, name }` and drops it. The interface must be widened first or the filter will not typecheck.

**Files:**
- Modify: `apps/web/src/components/timetable/TimetableView.tsx:12-15` (interface), `:215-219` and `:259-263` (the two `<select>` bodies)
- Test: `apps/web/tests/timetable-view.test.tsx` (confirm with `ls tests | grep -i timetable`; create following the pattern in `tests/assignments-view.test.tsx` if absent)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SubjectOption` becomes `{ id: number; name: string; gradeId: number }`.

- [ ] **Step 1: Write the failing test**

```typescript
it("offers only the selected class's grade's subjects", async () => {
  const classes = [
    { id: 1, gradeId: 10, gradeName: "Grade 10", section: "A" },
    { id: 2, gradeId: 1, gradeName: "Grade 1", section: "A" },
  ];
  const subjects = [
    { id: 100, name: "Advanced Calculus", gradeId: 10 },
    { id: 200, name: "Finger Painting", gradeId: 1 },
  ];
  const periods = [
    { id: 1, order: 1, label: "Period 1", isBreak: false },
  ];

  render(
    <TimetableView classes={classes} subjects={subjects} periods={periods} role="admin" />
  );

  const select = await screen.findByLabelText("Subject for Period 1 on Monday");
  const options = within(select).getAllByRole("option").map((o) => o.textContent);

  expect(options).toContain("Advanced Calculus");
  expect(options).not.toContain("Finger Painting");
});
```

`TimetableView` fetches entries and faculty on mount. Follow whatever `fetch` stubbing pattern `tests/assignments-view.test.tsx` uses — read that file first and mirror it rather than inventing a new approach. The component defaults `classId` to `classes[0]`, so Grade 10 is the selected class here.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/timetable-view.test.tsx -t "only the selected class"`

Expected: FAIL on the `not.toContain` assertion — both subjects render today. If it instead fails on a TypeScript error about `gradeId` not existing on `SubjectOption`, that is also the expected failure and confirms correction 3.

- [ ] **Step 3: Widen the interface**

```typescript
interface SubjectOption {
  id: number;
  name: string;
  gradeId: number;
}
```

No change is needed at the call site — `TimetablePage` already passes objects carrying `gradeId`.

- [ ] **Step 4: Derive the filtered list**

`TimetableView` already computes the selected class for other purposes; find that derivation near the `classId` state declaration. If it exists, reuse it. If not, add both lines alongside the existing derived values:

```typescript
  const selectedClass = classes.find((c) => String(c.id) === classId) ?? null;
  const availableSubjects = selectedClass
    ? subjects.filter((s) => s.gradeId === selectedClass.gradeId)
    : [];
```

- [ ] **Step 5: Use it in both dropdowns**

There are two `subjects.map((subject) => ...)` blocks — the add dropdown around `:215` and the edit dropdown around `:259`. Change both to `availableSubjects.map(...)`. Leave the option markup itself unchanged:

```typescript
                      {availableSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
```

Run `grep -n "subjects.map" src/components/timetable/TimetableView.tsx` afterwards and confirm it returns nothing — if a third occurrence exists, it needs the same change.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/timetable-view.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/components/timetable/TimetableView.tsx tests/timetable-view.test.tsx
git commit -m "fix(timetable): filter subject dropdown by the selected class's grade (H5)"
```

---

## Phase 1 Exit Criteria

Verify each before declaring the phase complete. Run the commands; do not assert from memory.

- [ ] `git diff main --stat -- apps/web/prisma/` is **empty**. No migration was written.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` clean.
- [ ] `npm test` green, with a passing count of the Task 0 baseline plus every test added above.
- [ ] Each of the six findings has at least one test that fails when its fix is reverted. Spot-check two by reverting the source change, running the test, confirming red, and restoring.
- [ ] Every documented audit repro is closed:
  - `PATCH /api/assignments/{id}` with another school's `subjectId` → 403, assignment unchanged.
  - `PUT /api/promotion-runs/{id}/mappings` with another school's `toClassId` → 400, mapping unchanged.
  - Creating a student against a prior-year class → `INVALID_CLASS`, no student and no enrollment written.
  - Creating a timetable entry with another school's `periodId` → 400.
  - The timetable subject dropdown shows only the selected class's grade's subjects.
  - Assigning a deactivated teacher → 400.

## What Phase 1 deliberately leaves open

- **Grade progression on promotion.** Task 3 asserts school, target year and non-archived. It cannot assert that Grade 3 promotes to Grade 4 rather than Grade 10, because `Grade` has no ordering column until Phase 7a. Tracked there as a follow-up.
- **Staff deactivation cascade.** Task 6 stops a deactivated teacher being *newly* assigned. It does not address the existing behaviour where deactivating a teacher hard-deletes their assignments without restoring them on reactivation and leaves their timetable rows intact — that is Phase 6.
