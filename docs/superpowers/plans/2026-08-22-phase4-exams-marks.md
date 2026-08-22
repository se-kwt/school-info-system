# Phase 4: Exams, Marks and Publication — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop marks being written across academic-year boundaries, move `maxMarks` off individual `Mark` rows onto the `Exam` where it belongs, add a pass mark and a publication gate, and give `Mark` the fields an academic record needs — finding H7 plus the exam and mark rows of the audit's missing-fields table.

**Architecture:** Seven sequential tasks. Task 1 closes H7 in pure code. Tasks 2–4 are the `Exam` schema work — `maxMarks`/`passMarks`/`weightage`, then the `published` gate, then the `Mark` field additions — each with its own migration so a failure is easy to isolate. Tasks 5–7 are the client validation, the index, and the parent-side gating. Each task lands as its own commit.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 (real-Postgres integration tests, `fileParallelism: false`), TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 4).

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` clean after every task; previously-passing tests stay green. Record the baseline before Task 1.
- Discriminated-union `Result` types; new error codes are **additive**.
- Tests import `{ prisma, resetDb }` from `./helpers/db`, `await resetDb()` in `beforeEach`.
- Failing test first, always.
- **No live data** — migrations may add required columns and assume `prisma migrate reset`.
- **If Phase 2 has landed:** read every generated migration and delete any `DROP INDEX "AcademicYear_schoolId_active_key"` line before applying. This applies to Tasks 2, 3, 4 and 6.

## The `maxMarks` move — read before Task 2

`maxMarks` currently lives on `Mark` (`schema.prisma:350`) and is supplied per-call by `enterMarks`. Two teachers entering marks for the same exam can therefore set different maxima for different subjects, and nothing reconciles them. Moving it to `Exam` makes the exam's total a property of the exam.

This is a genuine semantic narrowing: today "Maths out of 100, Art out of 50 in the same exam" is expressible, and after Task 2 it is not. That is the intended behaviour — the audit's complaint is precisely that the current freedom is accidental rather than designed, and the benchmark models it as `exam_rules` per exam. If per-subject maxima are ever wanted back, they belong on a subject-scoped exam rule, not on individual student marks.

`Mark.maxMarks` is **kept** as a denormalised snapshot so historical marks stay interpretable if an exam's total is later edited. It is written from the exam rather than from the caller.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `src/lib/exams.ts` | Year-filter `listExams`; accept the new `Exam` fields on create; publish/unpublish |
| `src/lib/marks.ts` | Assert exam year; read `maxMarks` from the exam; write the new `Mark` fields |
| `prisma/schema.prisma` | `Exam.maxMarks`/`passMarks`/`weightage`/`published`; `Mark.academicYearId`/`isAbsent`/`remarks`/`gradePoint`/`enteredById`/`enteredAt`; `Exam.examDate` index |
| `src/lib/parent/*` | Gate marks on `Exam.published` |
| `src/components/marks/*` | Marks-within-max client validation; publish control |

---

- [ ] **Task 0: Establish the baseline**

Run: `npm test 2>&1 | tail -20` and record the passing count.

---

### Task 1: Year-scope exams and marks (H7)

`listExams(prisma, schoolId)` (`exams.ts:10-21`) takes no year parameter, so `GET /api/exams` returns every exam the school has ever created, from every year, with no year field in the response. Neither `getMarksForClassExam` (`marks.ts:42`) nor `enterMarks` (`marks.ts:99`) compares `exam.academicYearId` against the active year — both look up the exam by `{ id, schoolId }` only.

A teacher can therefore pick a two-year-old exam from the unfiltered dropdown and enter marks against it for currently-enrolled students, producing a `Mark` whose exam belongs to one year and whose students belong to another. `Mark` has no `academicYearId` of its own to catch the inconsistency (Task 4 adds one).

**Files:**
- Modify: `apps/web/src/lib/exams.ts:10-21`
- Modify: `apps/web/src/lib/marks.ts:42-43`, `:99-100`
- Modify: every `listExams` caller — `grep -rn "listExams" src/`
- Test: `apps/web/tests/exams-api.test.ts`, `apps/web/tests/marks-lib.test.ts` (confirm filenames with `ls tests | grep -iE "exam|mark"`)

**Interfaces:**
- Produces: `listExams(prisma, schoolId, academicYearId)` — third parameter is **required**, and `ExamSummary` gains `academicYearId: number`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("lists only the requested year's exams", async () => {
  const staleYear = await prisma.academicYear.create({
    data: { schoolId, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
  });
  await createExam(prisma, schoolId, staleYear.id, { name: "Old Midterm", term: "Term 1", examDate: "2024-09-01" });
  await createExam(prisma, schoolId, yearId, { name: "Current Midterm", term: "Term 1", examDate: "2026-09-01" });

  const exams = await listExams(prisma, schoolId, yearId);

  expect(exams.map((e) => e.name)).toEqual(["Current Midterm"]);
  expect(exams[0].academicYearId).toBe(yearId);
});

it("refuses to read marks for an exam from another year", async () => {
  const staleYear = await prisma.academicYear.create({
    data: { schoolId, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
  });
  const stale = await createExam(prisma, schoolId, staleYear.id, { name: "Old Midterm", term: "Term 1", examDate: "2024-09-01" });

  const result = await getMarksForClassExam(prisma, {
    classId,
    examId: stale.id,
    schoolId,
    academicYearId: yearId,
    role: "admin",
    userId: adminId,
  });

  expect(result).toEqual({ ok: false, error: "INVALID_EXAM" });
});

it("refuses to enter marks against an exam from another year", async () => {
  const staleYear = await prisma.academicYear.create({
    data: { schoolId, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
  });
  const stale = await createExam(prisma, schoolId, staleYear.id, { name: "Old Midterm", term: "Term 1", examDate: "2024-09-01" });

  const result = await enterMarks(prisma, {
    classId,
    examId: stale.id,
    subjectId,
    maxMarks: 100,
    teacherUserId: teacherId,
    schoolId,
    academicYearId: yearId,
    entries: [{ studentId, marksObtained: 80 }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_EXAM" });
  expect(await prisma.mark.count({ where: { examId: stale.id } })).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/exams-api.test.ts tests/marks-lib.test.ts -t "another year"`

Expected: FAIL — both marks calls succeed today; the `listExams` test fails to compile.

- [ ] **Step 3: Year-filter `listExams`**

```typescript
export interface ExamSummary {
  id: number;
  name: string;
  term: string;
  examDate: string;
  academicYearId: number;
}

export async function listExams(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number
): Promise<ExamSummary[]> {
  const exams = await prisma.exam.findMany({
    where: { schoolId, academicYearId },
    orderBy: { examDate: "desc" },
  });
  return exams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    term: exam.term,
    examDate: exam.examDate.toISOString().slice(0, 10),
    academicYearId: exam.academicYearId,
  }));
}
```

Making the parameter required rather than optional is deliberate — an optional year would let a caller silently keep the old behaviour, which is exactly the defect.

- [ ] **Step 4: Assert the exam's year in both marks functions**

In `getMarksForClassExam`, `marks.ts:42`:

```typescript
  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId, academicYearId: params.academicYearId },
  });
  if (!exam) return { ok: false, error: "INVALID_EXAM" };
```

In `enterMarks`, `marks.ts:99`: identical change.

Folding the year into the lookup rather than adding a separate comparison keeps the existing `INVALID_EXAM` error code correct for both "no such exam" and "wrong year", which is the right level of detail to hand a client.

- [ ] **Step 5: Update every `listExams` caller**

Run: `grep -rn "listExams" src/`

Each site must pass the active year, resolved with `getActiveAcademicYear(prisma, claims.schoolId)` as those files already do for other queries. Do not pass `activeYear?.id ?? -1` — if there is no active year, surface that rather than querying for a year that cannot exist.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/exams-api.test.ts tests/marks-lib.test.ts tests/marks-api.test.ts`

- [ ] **Step 7: Full suite and typecheck**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/lib/exams.ts src/lib/marks.ts src/app tests
git commit -m "fix(exams): year-scope exam listing and marks entry (H7)"
```

---

### Task 2: Move `maxMarks` onto `Exam`, add `passMarks` and `weightage`

Read the "`maxMarks` move" note in the header before starting.

**Files:**
- Modify: `apps/web/prisma/schema.prisma:325-340`
- Create: migration (generated)
- Modify: `apps/web/src/lib/exams.ts` (create signature), `src/lib/marks.ts` (`enterMarks`)
- Test: `apps/web/tests/exams-api.test.ts`, `tests/marks-lib.test.ts`

**Interfaces:**
- Produces: `Exam.maxMarks: Float`, `Exam.passMarks: Float`, `Exam.weightage: Float @default(1)`.
- Produces: `createExam(prisma, schoolId, academicYearId, { name, term, examDate, maxMarks, passMarks, weightage? })`.
- Produces: `enterMarks` **drops** its `maxMarks` parameter — it now reads the exam's. Every caller changes.

- [ ] **Step 1: Write the failing tests**

```typescript
it("takes maxMarks from the exam, not the caller", async () => {
  const exam = await createExam(prisma, schoolId, yearId, {
    name: "Midterm",
    term: "Term 1",
    examDate: "2026-09-01",
    maxMarks: 50,
    passMarks: 20,
  });

  const result = await enterMarks(prisma, {
    classId,
    examId: exam.id,
    subjectId,
    teacherUserId: teacherId,
    schoolId,
    academicYearId: yearId,
    entries: [{ studentId, marksObtained: 40 }],
  });

  expect(result).toEqual({ ok: true });

  const mark = await prisma.mark.findFirstOrThrow({ where: { examId: exam.id, studentId } });
  expect(mark.maxMarks).toBe(50);
  expect(mark.grade).toBe("A");
});

it("rejects marks above the exam's maximum", async () => {
  const exam = await createExam(prisma, schoolId, yearId, {
    name: "Midterm",
    term: "Term 1",
    examDate: "2026-09-01",
    maxMarks: 50,
    passMarks: 20,
  });

  const result = await enterMarks(prisma, {
    classId,
    examId: exam.id,
    subjectId,
    teacherUserId: teacherId,
    schoolId,
    academicYearId: yearId,
    entries: [{ studentId, marksObtained: 80 }],
  });

  expect(result).toEqual({ ok: false, error: "INVALID_MARKS_RANGE" });
});

it("rejects an exam whose pass mark exceeds its maximum", async () => {
  await expect(
    createExam(prisma, schoolId, yearId, {
      name: "Broken",
      term: "Term 1",
      examDate: "2026-09-01",
      maxMarks: 50,
      passMarks: 80,
    })
  ).resolves.toEqual({ ok: false, error: "INVALID_PASS_MARKS" });
});
```

The third test changes `createExam`'s return type from `{ id }` to a `Result` union. That is a deliberate part of this task — the function currently cannot express a rejection at all.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/marks-lib.test.ts -t "from the exam"`

Expected: FAIL to compile — `createExam` has no `maxMarks` parameter.

- [ ] **Step 3: Extend the schema and migrate**

```prisma
model Exam {
  id             Int          @id @default(autoincrement())
  school         School       @relation(fields: [schoolId], references: [id])
  schoolId       Int
  name           String
  term           String
  examDate       DateTime
  maxMarks       Float
  passMarks      Float
  weightage      Float        @default(1)
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  academicYearId Int

  marks Mark[]

  @@index([schoolId])
  @@index([academicYearId])
  @@index([examDate])
}
```

The `@@index([examDate])` is the audit's index gap — the list is ordered on it every time. Adding it here rather than in a separate task avoids a second migration over the same table.

Run: `npx prisma migrate dev --create-only --name exam_marks_fields`, read the SQL, delete any `DROP INDEX "AcademicYear_schoolId_active_key"` line, then `npx prisma migrate dev && npm run prisma:migrate:test`.

- [ ] **Step 4: Update `createExam`**

```typescript
export type CreateExamResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_MAX_MARKS" }
  | { ok: false; error: "INVALID_PASS_MARKS" };

export async function createExam(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    name: string;
    term: string;
    examDate: string;
    maxMarks: number;
    passMarks: number;
    weightage?: number;
  }
): Promise<CreateExamResult> {
  if (input.maxMarks <= 0) return { ok: false, error: "INVALID_MAX_MARKS" };
  if (input.passMarks < 0 || input.passMarks > input.maxMarks) {
    return { ok: false, error: "INVALID_PASS_MARKS" };
  }

  const created = await prisma.exam.create({
    data: {
      schoolId,
      academicYearId,
      name: input.name,
      term: input.term,
      examDate: new Date(input.examDate),
      maxMarks: input.maxMarks,
      passMarks: input.passMarks,
      weightage: input.weightage ?? 1,
    },
  });
  return { ok: true, id: created.id };
}
```

Every caller now has to handle `{ ok: false }`. Find them with `grep -rn "createExam" src/ tests/` and update each — in the exam-create route this becomes a 400 with the relevant message.

- [ ] **Step 5: Update `enterMarks`**

Drop `maxMarks` from the params type. The exam lookup already runs first, so use its value:

```typescript
  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId, academicYearId: params.academicYearId },
  });
  if (!exam) return { ok: false, error: "INVALID_EXAM" };
```

Then replace every subsequent `params.maxMarks` with `exam.maxMarks`, and delete the `if (params.maxMarks <= 0) return { ok: false, error: "INVALID_MAX_MARKS" };` guard — `createExam` now enforces that at the source, so it cannot be violated here.

Keep `INVALID_MAX_MARKS` in the `EnterMarksResult` union even though nothing returns it any more. Removing a branch from a discriminated union is a breaking change for any caller that matches on it exhaustively, and this plan's constraints say new codes are additive. A follow-up cleanup can remove it once callers are audited.

- [ ] **Step 6: Update every `enterMarks` caller**

`grep -rn "enterMarks" src/ tests/`. The marks route currently reads `maxMarks` from the request body and passes it through — remove that, and remove the field from the client payload in the marks component.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/marks-lib.test.ts tests/marks-api.test.ts tests/exams-api.test.ts tests/exam-breakdown.test.tsx`

- [ ] **Step 8: Full suite, typecheck, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

`npm run seed` will fail if `prisma/fixtures.ts` creates exams without `maxMarks`/`passMarks`. Fix the fixture.

- [ ] **Step 9: Commit**

```bash
git add prisma src/lib/exams.ts src/lib/marks.ts src/app src/components tests
git commit -m "feat(exams): move maxMarks onto Exam, add passMarks and weightage"
```

---

### Task 3: Add `Exam.published` and gate parents on it

Parents see marks the instant a teacher saves a single subject. A partial result — Maths entered, the other five subjects blank — reaches the family before the school has decided the results are ready.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`Exam`)
- Create: migration (generated)
- Modify: `apps/web/src/lib/exams.ts` (add `setExamPublished`)
- Modify: the parent marks module (`grep -rln "mark" src/lib/parent`)
- Create: `apps/web/src/app/api/exams/[id]/route.ts` (PATCH publish/unpublish)
- Test: `apps/web/tests/exams-api.test.ts`, plus the parent marks test

**Interfaces:**
- Produces: `Exam.published Boolean @default(false)`.
- Produces: `setExamPublished(prisma, { examId, schoolId, published }): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" }>`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("hides marks from an unpublished exam", async () => {
  // ...create an exam (published defaults to false) and enter marks for a student
  const result = await getParentMarks(prisma, { studentId, parentUserId });
  expect(result.exams).toHaveLength(0);
});

it("shows marks once the exam is published", async () => {
  // ...same arrange
  await setExamPublished(prisma, { examId: exam.id, schoolId, published: true });

  const result = await getParentMarks(prisma, { studentId, parentUserId });
  expect(result.exams).toHaveLength(1);
});

it("refuses to publish another school's exam", async () => {
  const otherSchool = await prisma.school.create({ data: { name: "Other" } });
  const result = await setExamPublished(prisma, {
    examId: exam.id,
    schoolId: otherSchool.id,
    published: true,
  });
  expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
});
```

Read the parent marks module first and use its real function name and return shape — `getParentMarks` above is a placeholder for whatever it exports.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/parent-marks.test.ts -t "unpublished exam"`

Expected: FAIL — marks are visible today.

- [ ] **Step 3: Add the column**

```prisma
  published      Boolean      @default(false)
```

Default `false` is the safe direction: an exam created before anyone thinks about publication is hidden rather than exposed.

Run `npx prisma migrate dev --create-only --name exam_published`, read the SQL, delete any stray `DROP INDEX` line, apply.

- [ ] **Step 4: Add `setExamPublished`**

```typescript
export type SetExamPublishedResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function setExamPublished(
  prisma: PrismaClient,
  params: { examId: number; schoolId: number; published: boolean }
): Promise<SetExamPublishedResult> {
  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId },
  });
  if (!exam) return { ok: false, error: "NOT_FOUND" };

  await prisma.exam.update({
    where: { id: params.examId },
    data: { published: params.published },
  });
  return { ok: true };
}
```

- [ ] **Step 5: Gate the parent queries**

In every parent-facing query that reads marks, add `exam: { published: true }` to the `where`. Find them with:

```bash
grep -rn "prisma.mark\." src/lib/parent src/app/parent
```

Also check `src/lib/parent/overview.ts:172` — `latestMark` feeds the parent dashboard's "latest exam" tile and must be gated too, or the tile leaks the exam name and term of an unpublished result.

Teacher and admin views are **not** gated. They need to see what they are entering.

- [ ] **Step 6: Add the PATCH route and an admin control**

Create `src/app/api/exams/[id]/route.ts` with a `PATCH` accepting `{ published: boolean }`, admin-only, following the shape of the academic-years `[id]` route from Phase 2. Add a Publish / Unpublish toggle to the marks or exams admin view.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/exams-api.test.ts tests/parent-marks.test.ts tests/parent-dashboard.test.tsx`

- [ ] **Step 8: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 9: Commit**

```bash
git add prisma src/lib src/app src/components tests
git commit -m "feat(exams): add published flag and gate parent marks on it"
```

---

### Task 4: Add the missing `Mark` fields

`Mark` today is `examId`, `studentId`, `subjectId`, `marksObtained`, `maxMarks`, `grade`. An absent student is indistinguishable from one whose marks are not yet entered — both are simply no row. No GPA aggregation is possible. And nothing records who entered a mark or when, so an in-place correction leaves no trace.

**Files:**
- Modify: `apps/web/prisma/schema.prisma:341-356`
- Create: migration (generated)
- Modify: `apps/web/src/lib/marks.ts` (`enterMarks`, `MarkCell`, `getMarksForClassExam`)
- Test: `apps/web/tests/marks-lib.test.ts`

**Interfaces:**
- Produces: `Mark.academicYearId: Int`, `Mark.isAbsent: Boolean @default(false)`, `Mark.remarks: String?`, `Mark.gradePoint: Float?`, `Mark.enteredById: Int`, `Mark.enteredAt: DateTime @default(now())`.
- Produces: `enterMarks` entries accept `{ studentId, marksObtained, isAbsent?, remarks? }`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("records an absent student distinctly from an unentered one", async () => {
  const result = await enterMarks(prisma, {
    classId,
    examId,
    subjectId,
    teacherUserId: teacherId,
    schoolId,
    academicYearId: yearId,
    entries: [{ studentId, marksObtained: 0, isAbsent: true }],
  });

  expect(result).toEqual({ ok: true });

  const mark = await prisma.mark.findFirstOrThrow({ where: { examId, studentId } });
  expect(mark.isAbsent).toBe(true);
  expect(mark.grade).toBe("AB");
});

it("stamps the entering teacher and the year onto each mark", async () => {
  await enterMarks(prisma, {
    classId,
    examId,
    subjectId,
    teacherUserId: teacherId,
    schoolId,
    academicYearId: yearId,
    entries: [{ studentId, marksObtained: 80 }],
  });

  const mark = await prisma.mark.findFirstOrThrow({ where: { examId, studentId } });
  expect(mark.enteredById).toBe(teacherId);
  expect(mark.academicYearId).toBe(yearId);
  expect(mark.enteredAt).toBeInstanceOf(Date);
});

it("updates enteredById when a different teacher corrects a mark", async () => {
  const second = await prisma.user.create({
    data: { schoolId, phone: "+10000000055", role: "teacher", name: "Second Teacher" },
  });
  await prisma.classTeacher.create({
    data: { classId, subjectId, teacherUserId: second.id, academicYearId: yearId },
  });

  await enterMarks(prisma, { classId, examId, subjectId, teacherUserId: teacherId, schoolId, academicYearId: yearId, entries: [{ studentId, marksObtained: 80 }] });
  await enterMarks(prisma, { classId, examId, subjectId, teacherUserId: second.id, schoolId, academicYearId: yearId, entries: [{ studentId, marksObtained: 85 }] });

  const mark = await prisma.mark.findFirstOrThrow({ where: { examId, studentId } });
  expect(mark.marksObtained).toBe(85);
  expect(mark.enteredById).toBe(second.id);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/marks-lib.test.ts -t "absent student distinctly"`

Expected: FAIL to compile — `isAbsent` is not a valid entry field.

- [ ] **Step 3: Extend the schema and migrate**

```prisma
model Mark {
  id             Int          @id @default(autoincrement())
  exam           Exam         @relation(fields: [examId], references: [id])
  examId         Int
  student        Student      @relation(fields: [studentId], references: [id])
  studentId      Int
  subject        Subject      @relation(fields: [subjectId], references: [id])
  subjectId      Int
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  academicYearId Int
  marksObtained  Float
  maxMarks       Float
  grade          String
  gradePoint     Float?
  isAbsent       Boolean      @default(false)
  remarks        String?
  enteredBy      User         @relation("MarksEnteredBy", fields: [enteredById], references: [id])
  enteredById    Int
  enteredAt      DateTime     @default(now())

  @@unique([examId, studentId, subjectId])
  @@index([studentId])
  @@index([subjectId])
  @@index([academicYearId])
}
```

Add the two back-relations: `marks Mark[]` on `AcademicYear`, and `marksEntered Mark[] @relation("MarksEnteredBy")` on `User`.

`academicYearId` is redundant with the exam's — that redundancy is the point. It catches at the row level the inconsistency Task 1 prevents at the write level, and it lets a "all marks in year X" query skip the join.

Migrate as before; read the SQL and delete any stray `DROP INDEX` line.

- [ ] **Step 4: Update `enterMarks`**

Widen the entries type and the write. Absent students get `marksObtained: 0` and a distinct grade:

```typescript
    entries: { studentId: number; marksObtained: number; isAbsent?: boolean; remarks?: string }[];
```

Range validation must skip absent entries, which legitimately carry 0:

```typescript
  const allValid = params.entries.every(
    (e) => e.isAbsent || (e.marksObtained >= 0 && e.marksObtained <= exam.maxMarks)
  );
  if (!allValid) return { ok: false, error: "INVALID_MARKS_RANGE" };
```

And the upsert:

```typescript
      prisma.mark.upsert({
        where: { examId_studentId_subjectId: { examId: params.examId, studentId: entry.studentId, subjectId: params.subjectId } },
        create: {
          examId: params.examId,
          studentId: entry.studentId,
          subjectId: params.subjectId,
          academicYearId: params.academicYearId,
          marksObtained: entry.isAbsent ? 0 : entry.marksObtained,
          maxMarks: exam.maxMarks,
          grade: entry.isAbsent ? "AB" : computeGrade(entry.marksObtained, exam.maxMarks),
          isAbsent: entry.isAbsent ?? false,
          remarks: entry.remarks ?? null,
          enteredById: params.teacherUserId,
          enteredAt: new Date(),
        },
        update: {
          marksObtained: entry.isAbsent ? 0 : entry.marksObtained,
          maxMarks: exam.maxMarks,
          grade: entry.isAbsent ? "AB" : computeGrade(entry.marksObtained, exam.maxMarks),
          isAbsent: entry.isAbsent ?? false,
          remarks: entry.remarks ?? null,
          enteredById: params.teacherUserId,
          enteredAt: new Date(),
        },
      })
```

`enteredAt` is set explicitly on both branches — the schema default only fires on insert, and a correction must move the timestamp.

`gradePoint` stays null for now. Populating it needs a grading scheme, which the spec defers.

- [ ] **Step 5: Surface `isAbsent` in the read path**

Add `isAbsent: boolean` and `remarks: string | null` to `MarkCell` (`marks.ts:5-9`) and populate them in `getMarksForClassExam`'s cell construction. Update the marks grid to render "AB" for an absent student rather than a score.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/marks-lib.test.ts tests/marks-api.test.ts tests/exam-breakdown.test.tsx`

- [ ] **Step 7: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib/marks.ts src/components tests
git commit -m "feat(marks): add year, absence, remarks and entry attribution"
```

---

### Task 5: Client-side marks-within-max validation

The marks grid has no client-side range check, so an out-of-range value round-trips to the server and comes back as a generic error after the teacher has typed a full class's worth of scores.

**Files:**
- Modify: the marks entry component (`grep -rln "enterMarks\|/api/marks" src/components`)
- Test: `apps/web/tests/marks-view.test.tsx` (confirm the filename)

- [ ] **Step 1: Write the failing test**

```typescript
it("blocks submission when a score exceeds the exam maximum", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(/* marks view with an exam whose maxMarks is 50 */);

  await userEvent.type(screen.getByLabelText(/marks for /i), "80");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText(/cannot exceed 50/i)).toBeInTheDocument();
});

it("allows a score equal to the maximum", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  vi.stubGlobal("fetch", fetchMock);

  render(/* same */);

  await userEvent.type(screen.getByLabelText(/marks for /i), "50");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  expect(fetchMock).toHaveBeenCalled();
});
```

The boundary test matters — an off-by-one here rejects a perfect score.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/marks-view.test.tsx -t "exceeds the exam maximum"`

- [ ] **Step 3: Validate before submitting**

In the save handler, before the `fetch`:

```typescript
    const overMax = entries.find((e) => !e.isAbsent && e.marksObtained > exam.maxMarks);
    if (overMax) {
      setError(`Marks cannot exceed ${exam.maxMarks}`);
      return;
    }
    const negative = entries.find((e) => !e.isAbsent && e.marksObtained < 0);
    if (negative) {
      setError("Marks cannot be negative");
      return;
    }
```

The server check stays. Client validation is a convenience, never the boundary.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/marks-view.test.tsx`

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/components tests
git commit -m "feat(marks): validate marks against the exam maximum client-side"
```

---

## Phase 4 Exit Criteria

- [ ] `GET /api/exams` returns only the active year's exams, each carrying `academicYearId`.
- [ ] No mark can be written whose exam belongs to a different year than the caller's active year — verified against both `getMarksForClassExam` and `enterMarks`.
- [ ] Two teachers entering marks for the same exam cannot produce different maxima: `enterMarks` no longer accepts one.
- [ ] `createExam` rejects a pass mark above the maximum and a non-positive maximum.
- [ ] A parent sees no mark, and no exam name, from an unpublished exam; publishing reveals them.
- [ ] An absent student is stored with `isAbsent: true` and grade `AB`, distinct from a student with no row.
- [ ] Every mark records `enteredById`, `enteredAt` and `academicYearId`, and a correction by a second teacher updates the first two.
- [ ] The marks grid blocks an over-maximum score before it reaches the server, and accepts a score exactly equal to the maximum.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm test`, `npm run seed` all clean.

## What Phase 4 deliberately leaves open

- **`gradePoint` is added but never populated.** Filling it needs a configurable grading scheme, which the spec defers alongside the Term model. The column is added now so the later work is not blocked on another migration.
- **`weightage` is stored but unused.** It exists for term aggregation, which does not exist. Same deferral.
- **Hardcoded grade bands.** `computeGrade` still holds percentage bands in code. Deferred with the grading-scheme decision.
- **No consolidated result.** Term aggregation across exams is the largest benchmark gap and traces back to `Exam.term` being a free string. Deferred.
