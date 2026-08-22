# Phase 2: Academic Year Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a school a way to activate and archive an academic year, and make "exactly one active year per school" true by construction — findings H1 and H2, plus the promotion-into-archived-year gap and fee-structure year scoping.

**Architecture:** Six sequential tasks. Task 1 lands a raw-SQL partial unique index so the invariant is enforced by Postgres rather than by convention. Tasks 2–4 build the activation path the system has never had: two service functions, a `PATCH` route, and UI controls. Tasks 5–6 close two smaller year-scoping gaps in the same domain. Each task lands as its own commit.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 (real-Postgres integration tests, `fileParallelism: false`), TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 2).

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` must be clean after every task.
- All currently-passing tests must stay green. Record the baseline count before Task 1.
- Service functions return discriminated-union `Result` types. New error codes are **additive**.
- Multi-step writes go through `prisma.$transaction`.
- Tests import `{ prisma, resetDb }` from `./helpers/db` and call `await resetDb()` in `beforeEach`.
- Failing test first, always.
- **No live data.** Migrations may assume `prisma migrate reset` is available. No backfill scripts.

## The Prisma partial-index hazard — read before Task 1

Prisma 5.20 cannot express a partial (`WHERE`-filtered) unique index in the schema DSL. Task 1 therefore writes raw SQL into a `--create-only` migration. The index will exist in the database but **not** in `prisma/schema.prisma`.

The consequence, which will bite in Phases 3, 4, 5 and 7: when `prisma migrate dev` next generates a migration, it diffs the replayed migration history against `schema.prisma`, sees an index the schema does not declare, and emits a `DROP INDEX "AcademicYear_schoolId_active_key"` statement into the new migration.

**Every future `prisma migrate dev` in this repo must have its generated SQL read before it is applied, and any `DROP INDEX "AcademicYear_schoolId_active_key"` line deleted.** Task 1 adds this warning to the schema as a comment so the next engineer meets it where they will be working. Do not skip Step 6 of Task 1.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `prisma/migrations/<ts>_academic_year_single_active/migration.sql` | The partial unique index (hand-written SQL) |
| `prisma/schema.prisma` | A comment on `AcademicYear` documenting the index and the drift hazard |
| `src/lib/academic-years.ts` | New `activateAcademicYear` / `archiveAcademicYear` |
| `src/app/api/academic-years/[id]/route.ts` | New — `PATCH` with `{ action: "activate" \| "archive" }` |
| `src/components/academic-years/AcademicYearsView.tsx` | Activate / Archive buttons and status rendering |
| `src/lib/promotion.ts` | `startPromotionRun` rejects a non-`upcoming` target year |
| `src/lib/fee-structures.ts` | `createFeeStructure` validates the class's year; `listFeeStructures` filters by year |

---

- [ ] **Task 0: Establish the baseline**

Run: `npm test 2>&1 | tail -20`

Record the "N passed" count. A red baseline invalidates every later "tests still pass" claim — stop and report if the suite is not green.

---

### Task 1: Enforce one active year per school in the database (H2)

`AcademicYear` carries `@@unique([schoolId, name])` and nothing else (`schema.prisma:443-463`). `getActiveAcademicYear` resolves with `findFirst` (`academic-years.ts:7`), which on a tie returns whichever row Postgres happens to yield first. Two active years therefore mean different requests silently resolve to different years — attendance written against one, marks against another.

This pairs directly with H3's blind reactivation, which sets a year back to `active` without checking whether another already is.

**Files:**
- Create: `apps/web/prisma/migrations/<timestamp>_academic_year_single_active/migration.sql`
- Modify: `apps/web/prisma/schema.prisma:443` (comment only)
- Test: `apps/web/tests/academic-years-api.test.ts` (extend)

**Interfaces:**
- Produces: a database constraint named `AcademicYear_schoolId_active_key`. Task 2 relies on it to make its transaction safe.

- [ ] **Step 1: Write the failing test**

```typescript
it("refuses a second active year for the same school at the database level", async () => {
  const school = await prisma.school.create({ data: { name: "Constraint School" } });
  await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: "2026-27",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2027-03-31"),
      status: "active",
    },
  });

  await expect(
    prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-04-01"),
        endDate: new Date("2028-03-31"),
        status: "active",
      },
    })
  ).rejects.toThrow();
});

it("allows two active years in different schools", async () => {
  const schoolA = await prisma.school.create({ data: { name: "School A" } });
  const schoolB = await prisma.school.create({ data: { name: "School B" } });

  await prisma.academicYear.create({
    data: {
      schoolId: schoolA.id,
      name: "2026-27",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2027-03-31"),
      status: "active",
    },
  });

  const second = await prisma.academicYear.create({
    data: {
      schoolId: schoolB.id,
      name: "2026-27",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2027-03-31"),
      status: "active",
    },
  });

  expect(second.status).toBe("active");
});

it("allows many upcoming and archived years in one school", async () => {
  const school = await prisma.school.create({ data: { name: "Many Years School" } });
  await prisma.academicYear.createMany({
    data: [
      { schoolId: school.id, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
      { schoolId: school.id, name: "2025-26", startDate: new Date("2025-04-01"), endDate: new Date("2026-03-31"), status: "archived" },
      { schoolId: school.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
      { schoolId: school.id, name: "2028-29", startDate: new Date("2028-04-01"), endDate: new Date("2029-03-31"), status: "upcoming" },
    ],
  });

  const count = await prisma.academicYear.count({ where: { schoolId: school.id } });
  expect(count).toBe(4);
});
```

The third test is the one that proves the index is *partial* rather than a plain unique on `schoolId`. Do not omit it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/academic-years-api.test.ts -t "second active year"`

Expected: FAIL — the second create currently succeeds, so `rejects.toThrow()` does not fire.

- [ ] **Step 3: Generate an empty migration**

Run: `npx prisma migrate dev --create-only --name academic_year_single_active`

This creates a migration directory with an empty or near-empty `migration.sql`, because `schema.prisma` has not changed. That is expected.

- [ ] **Step 4: Write the SQL**

Replace the contents of the generated `migration.sql`:

```sql
-- Enforce at most one active academic year per school.
--
-- Prisma 5.20 cannot express a partial unique index in the schema DSL, so this
-- index is created by hand and does NOT appear in prisma/schema.prisma.
--
-- CONSEQUENCE: `prisma migrate dev` diffs the replayed migration history against
-- schema.prisma. Because it sees an index the schema does not declare, it will
-- emit a `DROP INDEX "AcademicYear_schoolId_active_key"` line into the NEXT
-- generated migration. Read every generated migration before applying it and
-- delete that line if present.
--
-- WARNING: this migration will FAIL if any school already has two or more
-- academic years with status = 'active'. Diagnostic:
--
--   SELECT "schoolId", COUNT(*) FROM "AcademicYear"
--   WHERE status = 'active' GROUP BY "schoolId" HAVING COUNT(*) > 1;
--
-- Resolve by archiving the duplicates before migrating.

CREATE UNIQUE INDEX "AcademicYear_schoolId_active_key"
  ON "AcademicYear"("schoolId")
  WHERE status = 'active';
```

- [ ] **Step 5: Apply the migration**

Run: `npx prisma migrate dev`

Expected: the migration applies cleanly. If it reports pending schema drift, stop and read the message — do not let Prisma "fix" it by regenerating.

Then apply it to the test database: `npm run prisma:migrate:test`

- [ ] **Step 6: Document the index in the schema**

In `apps/web/prisma/schema.prisma`, immediately above `model AcademicYear` (`:443`), add:

```prisma
/// Partial unique index `AcademicYear_schoolId_active_key` enforces at most one
/// `status = 'active'` row per school. It lives in migration
/// `<timestamp>_academic_year_single_active` because Prisma 5.20 cannot express
/// partial indexes here. `prisma migrate dev` will try to DROP it in every
/// future generated migration — read the generated SQL and delete that line.
```

Substitute the real timestamp. This comment is the only thing standing between the next engineer and silently dropping the constraint; it is not optional.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/academic-years-api.test.ts`

Expected: PASS, all three new tests included.

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

Expected: green. If a pre-existing test fails because a fixture created two active years for one school, that fixture was relying on the bug — fix the fixture, not the index.

- [ ] **Step 9: Commit**

```bash
git add prisma/migrations prisma/schema.prisma tests/academic-years-api.test.ts
git commit -m "feat(academic-years): enforce one active year per school (H2)"
```

---

### Task 2: `activateAcademicYear` and `archiveAcademicYear` (H1, service layer)

`createAcademicYear` hardcodes `status: "upcoming"` (`academic-years.ts:78`). The API exposes only `GET` and `POST`. The **only** code in the system that ever sets a year to `active` is inside promotion confirm and revert (`promotion.ts:354, 465`).

The seeded demo school works because `prisma/fixtures.ts:12` writes an active year directly, which is why this has never surfaced. A real school onboarded without fixtures has no active year and no route to create one — and every operational page degrades silently through `activeYear?.id ?? -1`.

**Files:**
- Modify: `apps/web/src/lib/academic-years.ts` (append two functions)
- Test: `apps/web/tests/academic-years-api.test.ts` (extend)

**Interfaces:**
- Produces: `activateAcademicYear(prisma, { academicYearId, schoolId }): Promise<ActivateAcademicYearResult>` where
  `type ActivateAcademicYearResult = { ok: true } | { ok: false; error: "NOT_FOUND" } | { ok: false; error: "ALREADY_ARCHIVED" }`
- Produces: `archiveAcademicYear(prisma, { academicYearId, schoolId }): Promise<ArchiveAcademicYearResult>` where
  `type ArchiveAcademicYearResult = { ok: true } | { ok: false; error: "NOT_FOUND" } | { ok: false; error: "LAST_ACTIVE_YEAR" }`
- Both are consumed by Task 3's route.

- [ ] **Step 1: Write the failing tests**

```typescript
it("activates an upcoming year and archives the previously active one", async () => {
  const school = await prisma.school.create({ data: { name: "Rollover School" } });
  const current = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
  });
  const next = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
  });

  const result = await activateAcademicYear(prisma, {
    academicYearId: next.id,
    schoolId: school.id,
  });

  expect(result).toEqual({ ok: true });
  expect((await prisma.academicYear.findUnique({ where: { id: next.id } }))?.status).toBe("active");
  expect((await prisma.academicYear.findUnique({ where: { id: current.id } }))?.status).toBe("archived");
});

it("activates the first year of a school that has none active", async () => {
  const school = await prisma.school.create({ data: { name: "Fresh School" } });
  const only = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "upcoming" },
  });

  const result = await activateAcademicYear(prisma, {
    academicYearId: only.id,
    schoolId: school.id,
  });

  expect(result).toEqual({ ok: true });
  const active = await getActiveAcademicYear(prisma, school.id);
  expect(active?.id).toBe(only.id);
});

it("refuses to activate a year belonging to another school", async () => {
  const schoolA = await prisma.school.create({ data: { name: "School A" } });
  const schoolB = await prisma.school.create({ data: { name: "School B" } });
  const foreign = await prisma.academicYear.create({
    data: { schoolId: schoolB.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "upcoming" },
  });

  const result = await activateAcademicYear(prisma, {
    academicYearId: foreign.id,
    schoolId: schoolA.id,
  });

  expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  expect((await prisma.academicYear.findUnique({ where: { id: foreign.id } }))?.status).toBe("upcoming");
});

it("refuses to re-activate an archived year", async () => {
  const school = await prisma.school.create({ data: { name: "Archive School" } });
  const old = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2024-25", startDate: new Date("2024-04-01"), endDate: new Date("2025-03-31"), status: "archived" },
  });

  const result = await activateAcademicYear(prisma, {
    academicYearId: old.id,
    schoolId: school.id,
  });

  expect(result).toEqual({ ok: false, error: "ALREADY_ARCHIVED" });
});

it("refuses to archive the only active year", async () => {
  const school = await prisma.school.create({ data: { name: "Sole Year School" } });
  const only = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
  });

  const result = await archiveAcademicYear(prisma, {
    academicYearId: only.id,
    schoolId: school.id,
  });

  expect(result).toEqual({ ok: false, error: "LAST_ACTIVE_YEAR" });
  expect((await prisma.academicYear.findUnique({ where: { id: only.id } }))?.status).toBe("active");
});

it("archives an upcoming year without touching the active one", async () => {
  const school = await prisma.school.create({ data: { name: "Cancel School" } });
  const current = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "active" },
  });
  const cancelled = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "upcoming" },
  });

  const result = await archiveAcademicYear(prisma, {
    academicYearId: cancelled.id,
    schoolId: school.id,
  });

  expect(result).toEqual({ ok: true });
  expect((await prisma.academicYear.findUnique({ where: { id: cancelled.id } }))?.status).toBe("archived");
  expect((await prisma.academicYear.findUnique({ where: { id: current.id } }))?.status).toBe("active");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/academic-years-api.test.ts -t "activates an upcoming year"`

Expected: FAIL with "activateAcademicYear is not defined" (or a TypeScript error on the import).

- [ ] **Step 3: Implement `activateAcademicYear`**

Append to `apps/web/src/lib/academic-years.ts`:

```typescript
export type ActivateAcademicYearResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "ALREADY_ARCHIVED" };

export async function activateAcademicYear(
  prisma: PrismaClient,
  params: { academicYearId: number; schoolId: number }
): Promise<ActivateAcademicYearResult> {
  const target = await prisma.academicYear.findFirst({
    where: { id: params.academicYearId, schoolId: params.schoolId },
  });
  if (!target) return { ok: false, error: "NOT_FOUND" };
  if (target.status === "archived") return { ok: false, error: "ALREADY_ARCHIVED" };
  if (target.status === "active") return { ok: true };

  await prisma.$transaction([
    prisma.academicYear.updateMany({
      where: { schoolId: params.schoolId, status: "active" },
      data: { status: "archived" },
    }),
    prisma.academicYear.update({
      where: { id: params.academicYearId },
      data: { status: "active" },
    }),
  ]);

  return { ok: true };
}
```

Three details that matter:

- The archive-then-activate pair runs in **one transaction**. Task 1's partial unique index would reject the intermediate state if these were separate statements, so this ordering is load-bearing, not stylistic.
- Activating an already-active year returns `{ ok: true }` rather than an error. The operation is idempotent by intent — a double-clicked button should not produce a failure.
- Re-activating an `archived` year is refused. Reopening a closed year is a data-repair operation, not a routine one, and it would need to decide what happens to the enrollments already promoted out of it. Out of scope.

- [ ] **Step 4: Implement `archiveAcademicYear`**

```typescript
export type ArchiveAcademicYearResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "LAST_ACTIVE_YEAR" };

export async function archiveAcademicYear(
  prisma: PrismaClient,
  params: { academicYearId: number; schoolId: number }
): Promise<ArchiveAcademicYearResult> {
  const target = await prisma.academicYear.findFirst({
    where: { id: params.academicYearId, schoolId: params.schoolId },
  });
  if (!target) return { ok: false, error: "NOT_FOUND" };
  if (target.status === "archived") return { ok: true };

  if (target.status === "active") {
    return { ok: false, error: "LAST_ACTIVE_YEAR" };
  }

  await prisma.academicYear.update({
    where: { id: params.academicYearId },
    data: { status: "archived" },
  });

  return { ok: true };
}
```

Archiving the active year is always refused, because the index guarantees it is the *only* active year and a school with none has every operational page silently empty. The way to move on from the active year is to activate its successor, which archives it as a side effect.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/academic-years-api.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/lib/academic-years.ts tests/academic-years-api.test.ts
git commit -m "feat(academic-years): add activate and archive transitions (H1)"
```

---

### Task 3: `PATCH /api/academic-years/[id]` (H1, route layer)

There is no `[id]` route directory under `src/app/api/academic-years/` at all — only `route.ts`. Create one.

**Files:**
- Create: `apps/web/src/app/api/academic-years/[id]/route.ts`
- Test: `apps/web/tests/academic-years-api.test.ts` (extend)

**Interfaces:**
- Consumes: `activateAcademicYear`, `archiveAcademicYear` from Task 2.
- Produces: `PATCH /api/academic-years/:id` accepting `{ "action": "activate" | "archive" }`, admin-only.

- [ ] **Step 1: Write the failing test**

Follow the existing route-test pattern in this file — read how it stubs `requireApiRole` and constructs `Request` objects before writing, and mirror it exactly. The assertions to make:

```typescript
it("PATCH activates a year for an admin", async () => {
  // ...arrange a school with an active 2026-27 and an upcoming 2027-28,
  // authenticated as an admin of that school
  const response = await PATCH(
    new Request("http://test/api/academic-years/" + next.id, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    }),
    { params: Promise.resolve({ id: String(next.id) }) }
  );

  expect(response.status).toBe(200);
  expect((await prisma.academicYear.findUnique({ where: { id: next.id } }))?.status).toBe("active");
});

it("PATCH rejects a non-admin", async () => {
  // ...authenticated as a teacher
  expect(response.status).toBe(403);
});

it("PATCH rejects an unknown action", async () => {
  // ...body { action: "delete" }
  expect(response.status).toBe(400);
});

it("PATCH refuses to archive the only active year", async () => {
  // ...body { action: "archive" } against the sole active year
  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/academic-years-api.test.ts -t "PATCH"`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Create the route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { activateAcademicYear, archiveAcademicYear } from "@/lib/academic-years";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);

    const academicYearId = Number(params.id);
    if (Number.isNaN(academicYearId)) {
      return NextResponse.json({ error: "Academic year not found" }, { status: 404 });
    }

    let action: string | undefined;
    try {
      ({ action } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (action !== "activate" && action !== "archive") {
      return NextResponse.json(
        { error: 'action must be "activate" or "archive"' },
        { status: 400 }
      );
    }

    if (action === "activate") {
      const result = await activateAcademicYear(prisma, {
        academicYearId,
        schoolId: claims.schoolId,
      });
      if (!result.ok) {
        if (result.error === "NOT_FOUND") {
          return NextResponse.json({ error: "Academic year not found" }, { status: 404 });
        }
        return NextResponse.json(
          { error: "An archived year cannot be reactivated" },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true });
    }

    const result = await archiveAcademicYear(prisma, {
      academicYearId,
      schoolId: claims.schoolId,
    });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Academic year not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Activate the next year instead — a school must always have one active year" },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

The `props: { params: Promise<{ id: string }> }` signature and the `await props.params` line match Next 16's async params convention already used by `src/app/api/assignments/[id]/route.ts`. Do not use the older synchronous shape.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/academic-years-api.test.ts`

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

`npm run build` matters here — a new route file is the kind of change that compiles under `tsc` but fails Next's route-type validation.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/academic-years/\[id\]/route.ts tests/academic-years-api.test.ts
git commit -m "feat(academic-years): add PATCH activate/archive route (H1)"
```

---

### Task 4: Activate and archive controls in the UI (H1, view layer)

`AcademicYearsView` renders a create form and a list, with no per-row actions. Add them.

**Files:**
- Modify: `apps/web/src/components/academic-years/AcademicYearsView.tsx`
- Test: `apps/web/tests/academic-years-view.test.tsx` (create; follow the pattern in `tests/classes-view.test.tsx`)

**Interfaces:**
- Consumes: `PATCH /api/academic-years/:id` from Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
it("shows an Activate button for an upcoming year and calls the API", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <AcademicYearsView
      initialYears={[
        { id: 1, name: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31", status: "active" },
        { id: 2, name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31", status: "upcoming" },
      ]}
    />
  );

  await userEvent.click(screen.getByRole("button", { name: "Activate 2027-28" }));

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/academic-years/2",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "activate" }),
    })
  );
});

it("shows no Activate button for the already-active year", () => {
  render(
    <AcademicYearsView
      initialYears={[
        { id: 1, name: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31", status: "active" },
      ]}
    />
  );

  expect(screen.queryByRole("button", { name: "Activate 2026-27" })).toBeNull();
});

it("shows no Activate button for an archived year", () => {
  render(
    <AcademicYearsView
      initialYears={[
        { id: 1, name: "2024-25", startDate: "2024-04-01", endDate: "2025-03-31", status: "archived" },
      ]}
    />
  );

  expect(screen.queryByRole("button", { name: "Activate 2024-25" })).toBeNull();
});
```

The component's `refresh()` calls `fetch("/api/academic-years")` and reads `body.academicYears`, so the mock above must also satisfy that call. Give the mock a per-URL implementation rather than a single resolved value if the simple version makes `refresh()` throw.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/academic-years-view.test.tsx`

Expected: FAIL — no such button exists.

- [ ] **Step 3: Add the handler**

In `AcademicYearsView`, alongside `handleCreate`:

```typescript
  async function handleTransition(id: number, action: "activate" | "archive") {
    setError(null);
    const response = await fetch(`/api/academic-years/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (response.ok) {
      await refresh();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }
```

This mirrors `handleCreate`'s existing shape — same error handling, same `refresh()` on success.

- [ ] **Step 4: Render the buttons**

In the row rendering below the create form, add per-row actions. An `upcoming` year gets both Activate and Archive; an `active` year gets neither (activating it is a no-op, archiving it is refused by the server); an `archived` year gets neither.

```tsx
{year.status === "upcoming" && (
  <>
    <button
      type="button"
      onClick={() => handleTransition(year.id, "activate")}
      className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
    >
      Activate {year.name}
    </button>
    <button
      type="button"
      onClick={() => handleTransition(year.id, "archive")}
      className="rounded border border-gray-300 px-2 py-1 text-xs"
    >
      Archive {year.name}
    </button>
  </>
)}
```

Including the year name in the button text is what makes the accessible name unique per row, which is what the test queries on. Do not replace it with a bare "Activate" plus a `title` attribute.

Match the surrounding row markup — read how the list is currently rendered and place these inside the existing row element rather than restructuring it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/academic-years-view.test.tsx`

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components/academic-years/AcademicYearsView.tsx tests/academic-years-view.test.tsx
git commit -m "feat(academic-years): add activate and archive controls (H1)"
```

---

### Task 5: Promotion cannot target a non-upcoming year

`startPromotionRun` resolves the target year with `findFirst({ where: { id, schoolId } })` (`promotion.ts:37-39`) and never checks `toYear.status`. A promotion can therefore be drafted into an already-archived year, or into the currently-active one.

**Files:**
- Modify: `apps/web/src/lib/promotion.ts:37-40`
- Test: `apps/web/tests/promotion-engine.test.ts` (extend)

**Interfaces:**
- Produces: `StartPromotionRunResult` gains `| { ok: false; error: "TARGET_YEAR_NOT_UPCOMING" }`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("refuses to start a run targeting an archived year", async () => {
  const archived = await prisma.academicYear.create({
    data: { schoolId, name: "2020-21", startDate: new Date("2020-04-01"), endDate: new Date("2021-03-31"), status: "archived" },
  });

  const result = await startPromotionRun(prisma, {
    schoolId,
    initiatedById: adminId,
    toAcademicYearId: archived.id,
  });

  expect(result).toEqual({ ok: false, error: "TARGET_YEAR_NOT_UPCOMING" });
});

it("refuses to start a run targeting the currently active year", async () => {
  const result = await startPromotionRun(prisma, {
    schoolId,
    initiatedById: adminId,
    toAcademicYearId: activeYearId,
  });

  expect(result).toEqual({ ok: false, error: "TARGET_YEAR_NOT_UPCOMING" });
});
```

`startPromotionRun` returns an existing draft early if one exists, so make sure no draft run is present when these run — either use a fresh school or delete any draft in the test's arrange step.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/promotion-engine.test.ts -t "archived year"`

Expected: FAIL — the run is created.

- [ ] **Step 3: Add the check**

Extend the result union with `| { ok: false; error: "TARGET_YEAR_NOT_UPCOMING" }`, then after the existing `toYear` lookup:

```typescript
  const toYear = await prisma.academicYear.findFirst({
    where: { id: params.toAcademicYearId, schoolId: params.schoolId },
  });
  if (!toYear) return { ok: false, error: "INVALID_ACADEMIC_YEAR" };
  if (toYear.status !== "upcoming") return { ok: false, error: "TARGET_YEAR_NOT_UPCOMING" };
```

- [ ] **Step 4: Map the error in the route**

Find the promotion-runs POST handler (`grep -rl "startPromotionRun" src/app/api`) and add a 400 branch:

```typescript
      if (result.error === "TARGET_YEAR_NOT_UPCOMING") {
        return NextResponse.json(
          { error: "Promotion can only target an upcoming academic year" },
          { status: 400 }
        );
      }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/promotion-engine.test.ts`

Expected: PASS. Pre-existing tests that start a run against a year they created as `upcoming` are unaffected; any that used an `active` or `archived` target were relying on the bug and need their fixture corrected.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/lib/promotion.ts src/app/api tests/promotion-engine.test.ts
git commit -m "fix(promotion): reject a target year that is not upcoming"
```

---

### Task 6: Year-scope fee structures

`createFeeStructure` (`fee-structures.ts:49`) validates the class against the school only, then writes the server-supplied `academicYearId` onto the row — the same class/year mismatch shape as C3. `listFeeStructures` (`:24`) filters by `classId` alone, so it returns every year's structures for that class.

`Class` is year-scoped, so a class id already implies exactly one year. That makes the fix a comparison rather than an extra filter on write, and an explicit filter on read.

**Files:**
- Modify: `apps/web/src/lib/fee-structures.ts:43-62` and `:14-36`
- Test: `apps/web/tests/fee-structures-api.test.ts` (extend)

**Interfaces:**
- Produces: `listFeeStructures` gains a required `academicYearId` parameter. **Every caller must be updated** — find them with `grep -rn "listFeeStructures" src/`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("refuses to create a fee structure for a class in a different year", async () => {
  const staleYear = await prisma.academicYear.create({
    data: { schoolId, name: "2025-26", startDate: new Date("2025-04-01"), endDate: new Date("2026-03-31"), status: "archived" },
  });
  const staleClass = await prisma.class.create({
    data: { schoolId, gradeId, section: "A", academicYearId: staleYear.id },
  });

  const result = await createFeeStructure(prisma, schoolId, activeYearId, {
    classId: staleClass.id,
    term: "Term 1",
    amount: 5000,
    dueDate: "2026-06-01",
  });

  expect(result).toEqual({ ok: false, error: "INVALID_CLASS" });
  expect(await prisma.feeStructure.count({ where: { classId: staleClass.id } })).toBe(0);
});

it("lists only the requested year's fee structures", async () => {
  const staleYear = await prisma.academicYear.create({
    data: { schoolId, name: "2025-26", startDate: new Date("2025-04-01"), endDate: new Date("2026-03-31"), status: "archived" },
  });
  await prisma.feeStructure.create({
    data: { schoolId, academicYearId: staleYear.id, classId, term: "Old Term", amount: 100, dueDate: new Date("2025-06-01") },
  });
  await prisma.feeStructure.create({
    data: { schoolId, academicYearId: activeYearId, classId, term: "Current Term", amount: 200, dueDate: new Date("2026-06-01") },
  });

  const result = await listFeeStructures(prisma, {
    classId,
    schoolId,
    academicYearId: activeYearId,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.feeStructures.map((f) => f.term)).toEqual(["Current Term"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fee-structures-api.test.ts -t "different year"`

Expected: FAIL on the create test (the structure is written); the list test fails to compile because `listFeeStructures` takes no `academicYearId` yet.

- [ ] **Step 3: Year-scope the create**

In `createFeeStructure`, replace the class lookup:

```typescript
  const klass = await prisma.class.findFirst({
    where: { id: input.classId, schoolId, academicYearId },
  });
  if (!klass) return { ok: false, error: "INVALID_CLASS" };
```

`academicYearId` is already a parameter — no signature change.

- [ ] **Step 4: Year-scope the list**

Widen the signature and the query:

```typescript
export async function listFeeStructures(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; academicYearId: number }
): Promise<ListFeeStructuresResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId, academicYearId: params.academicYearId },
  });
  if (!klass) return { ok: false, error: "INVALID_CLASS" };

  const feeStructures = await prisma.feeStructure.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId },
    orderBy: { dueDate: "desc" },
  });
  // ...rest unchanged
```

- [ ] **Step 5: Update every caller**

Run: `grep -rn "listFeeStructures" src/`

Each call site must now pass `academicYearId`. In route handlers and pages the value comes from `getActiveAcademicYear(prisma, claims.schoolId)` — the same resolution those files already do for other queries. Do not default it to `-1`; if no active year exists, the caller should surface that rather than silently querying for a nonexistent year.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/fee-structures-api.test.ts tests/fee-payments-api.test.ts tests/fees-history.test.ts`

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/lib/fee-structures.ts src/app tests/fee-structures-api.test.ts
git commit -m "fix(fees): year-scope fee structure create and list"
```

---

## Phase 2 Exit Criteria

Run the commands; do not assert from memory.

- [ ] A second active year cannot be created for one school by any path — direct Prisma write, `activateAcademicYear`, or the `PATCH` route.
- [ ] A school seeded with **no** fixtures can reach an active year entirely through the UI: create a year, click Activate, and `getActiveAcademicYear` returns it.
- [ ] Archiving the sole active year is refused with a message telling the admin to activate the successor instead.
- [ ] A promotion run cannot be drafted into an `active` or `archived` year.
- [ ] `listFeeStructures` returns only the requested year's rows, and every caller passes a real year id.
- [ ] `prisma/schema.prisma` carries the comment documenting the partial index and the `migrate dev` drift hazard.
- [ ] `npx tsc --noEmit`, `npm run build` and `npm test` all clean.

## What Phase 2 deliberately leaves open

- **Promotion's own reactivation path.** `revertPromotionRun` still sets the source year back to `active` without the transactional archive-and-activate this phase introduced. With Task 1's index in place that now throws rather than corrupting — which is an improvement, but a raw Postgres error is not an acceptable user-facing outcome. Phase 3 converts it into a typed error and reuses this phase's transaction shape.
- **Browsing a past year.** Every operational page still resolves the active year server-side with no way to view a previous one. Deferred in the spec; it needs a year-selector concept that does not exist.
