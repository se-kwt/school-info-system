# Critical Security & Data-Integrity Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-blast-radius correctness and security gaps identified in the 2026-08-10 nine-agent codebase audit — cross-tenant data leaks, session/authorization holes, a non-atomic money path, a re-runnable promotion engine, an unindexed database, and the missing CI safety net — without regressing the 463 currently-passing tests.

**Architecture:** Nine independent, sequential tasks ordered by blast-radius-per-hour-of-work (per the audit's own ordering). Each task touches one narrow slice of `apps/web/src/lib/**` or `apps/web/prisma/**`, is covered by a new failing-then-passing Vitest test against the real Postgres test database, and lands as its own commit. No task depends on another task's code changes (only on task 7's CI existing to catch future regressions of tasks 1–6, 8–9).

**Tech Stack:** Next.js 14.2.35, React 18.3, Prisma 5.20, PostgreSQL, Vitest (tests run against a real DB per `fileParallelism: false` in `apps/web/vitest.config.ts`), TypeScript.

## Global Constraints

- Every fix must keep `npx tsc --noEmit` and `npm run build` clean inside `apps/web/`.
- Every fix must keep the existing 463 passing tests green — do not weaken an existing assertion to make a new one pass.
- Follow existing code conventions in the touched files: discriminated-union `Result` return types (`{ ok: true; ... } | { ok: false; error: "SOME_CODE" }`), Prisma `$transaction` for multi-step writes, `resetDb()` + real-Postgres integration tests under `apps/web/tests/`.
- New error codes are additive to existing discriminated unions — never change the shape of an existing `ok: false` branch other callers already match on.
- Do not fix unrelated findings from the audit inside these tasks (e.g. don't fix the attendance timezone bug while touching `attendance.ts` for something else) — each task is scoped to exactly what it claims.

## ⚠️ Correction to the source audit

The audit artifact this plan is based on states the repo is on **Next.js 16.3** with a completed Next 16 migration. Verified against the current `main` branch: **`apps/web/package.json` shows `next@^14.2.35` and `react@18.3.1`** — there is no Next 16 migration in this working tree. Either the audit was run against a different branch/worktree, or that migration was never merged. This plan ignores the audit's Next-16-specific claims (the "clean migration" praise, the `cacheComponents`/dynamic-route commentary) since they don't describe code that exists here. Everything else below was independently re-verified against current `main` and is accurate as cited.

One other correction: the audit's Critical Finding #1 cites `scoped-queries.ts:3-12` as the location of the unscoped phone lookup. That file only contains `getStudentsForParent` (keyed on `parentUserId`) and has no phone lookup at all. The actual unscoped `findUnique({ where: { phone } })` calls live in `apps/web/src/lib/school-setup/students.ts:136,176,346`, `apps/web/src/lib/school-setup/staff.ts:56,125`, and `apps/web/src/lib/auth/send-otp.ts:11`. Task 1 below is scoped to `students.ts` only, matching the audit's own severity ranking (student creation/editing is the highest-traffic path); `staff.ts` and `send-otp.ts` share the same root cause and should get an identical fix as a fast follow-up once Task 1's approach is validated.

---

### Task 1: Flag cross-school parent phone reuse — decision + implementation

**Why this is first:** `User.phone` is a single **globally unique** column (`prisma/schema.prisma:162`, `phone String @unique`) — it is not `@@unique([schoolId, phone])`. That's a real constraint, not a bug in the query: there can only ever be *one* `User` row for a given phone number across every school in the system. So "add a `schoolId` filter to the lookup" (the audit's phrasing) isn't mechanically possible as a query change — there's nothing to filter, `findUnique` on a single unique column returns at most one row regardless. The actual gap is that when `createStudent`/`editStudent` find an existing global user by phone, they never check whether that user already belongs to a *different* school before silently attaching them as a parent of a student in *this* school.

**Decision needed before coding (pick one, both are legitimate — this is a product call, not a technical one):**

- **Option A (recommended, smallest change):** Treat a phone belonging to a different school as an error. A real parent with children at two different schools is rare enough, and risky enough to get silently wrong, that requiring explicit support later is safer than allowing it by accident today. Add a new error `PHONE_BELONGS_TO_ANOTHER_SCHOOL` and reject the create/edit.
- **Option B (larger change, out of scope for this task):** Make phone uniqueness per-school (`@@unique([schoolId, phone])`) so the same phone number can have independent parent accounts in different schools. This requires a schema migration, changes to the login/OTP flow (which currently looks up a user by phone alone with no school context — see `send-otp.ts:11`), and a decision about what happens to the *existing* production data where phone is already globally unique. Not attempted here.

This task implements **Option A**.

**Files:**
- Modify: `apps/web/src/lib/school-setup/students.ts:90-98` (add error to `CreateStudentResult` union), `:135-138` (createStudent check), `:216-224` (add error to `EditStudentResult` union), `:345-369` (editStudent parent loop)
- Test: `apps/web/tests/students-lib.test.ts`

**Interfaces:**
- Produces: new error variant `{ ok: false; error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" }` on both `CreateStudentResult` and `EditStudentResult`.

- [ ] **Step 1: Write the failing test for `createStudent`**

Add to `apps/web/tests/students-lib.test.ts` (follow the existing `describe("students.ts scalar fields", ...)` file's setup pattern — `resetDb()` in `beforeEach`, `prisma.school.create` + `createActiveYear` + `createClass` helpers already imported at the top of the file):

```typescript
it("rejects createStudent when the parent phone belongs to a user in a different school", async () => {
  const schoolA = await prisma.school.create({ data: { name: "School A" } });
  const schoolB = await prisma.school.create({ data: { name: "School B" } });
  const yearA = await createActiveYear(prisma, schoolA.id);
  const yearB = await createActiveYear(prisma, schoolB.id);
  const classA = await createClass(prisma, { schoolId: schoolA.id, academicYearId: yearA.id, name: "Grade 3", section: "A" });
  const classB = await createClass(prisma, { schoolId: schoolB.id, academicYearId: yearB.id, name: "Grade 3", section: "A" });

  await createStudent(prisma, schoolA.id, yearA.id, {
    name: "Student A",
    dob: "2016-01-01",
    classId: classA.id,
    admissionNo: "A-100",
    parents: [{ relationship: "Mother", name: "Shared Parent", phone: "+15550009999" }],
  });

  const result = await createStudent(prisma, schoolB.id, yearB.id, {
    name: "Student B",
    dob: "2016-01-01",
    classId: classB.id,
    admissionNo: "B-100",
    parents: [{ relationship: "Mother", name: "Shared Parent", phone: "+15550009999" }],
  });

  expect(result).toMatchObject({ ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "PHONE_BELONGS_TO_ANOTHER_SCHOOL"
```
Expected: FAIL — `result.ok` is currently `true`, the second student silently gets linked to School A's parent.

- [ ] **Step 3: Add the error variant and the check in `createStudent`**

In `apps/web/src/lib/school-setup/students.ts`, extend the union at line 95:

```typescript
export type CreateStudentResult =
  | { ok: true; student: { id: number; name: string; admissionNo: string } }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "DUPLICATE_STUDENT_ID" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" }
  | { ok: false; error: "PARENT_REQUIRED" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SIBLING" };
```

Replace the loop at lines 135-138:

```typescript
  for (const parentInput of input.parents) {
    const existingParent = await prisma.user.findUnique({ where: { phone: parentInput.phone } });
    if (existingParent && existingParent.role !== "parent") return { ok: false, error: "PHONE_WRONG_ROLE" };
    if (existingParent && existingParent.schoolId !== schoolId) return { ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" };
  }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "PHONE_BELONGS_TO_ANOTHER_SCHOOL"
```
Expected: PASS

- [ ] **Step 5: Write the failing test for `editStudent`**

Add to the same file:

```typescript
it("rejects editStudent when the new parent phone belongs to a user in a different school", async () => {
  const schoolA = await prisma.school.create({ data: { name: "School A" } });
  const schoolB = await prisma.school.create({ data: { name: "School B" } });
  const yearA = await createActiveYear(prisma, schoolA.id);
  const yearB = await createActiveYear(prisma, schoolB.id);
  const classA = await createClass(prisma, { schoolId: schoolA.id, academicYearId: yearA.id, name: "Grade 3", section: "A" });
  const classB = await createClass(prisma, { schoolId: schoolB.id, academicYearId: yearB.id, name: "Grade 3", section: "A" });

  await createStudent(prisma, schoolA.id, yearA.id, {
    name: "Student A",
    dob: "2016-01-01",
    classId: classA.id,
    admissionNo: "A-101",
    parents: [{ relationship: "Mother", name: "Shared Parent", phone: "+15550008888" }],
  });

  const studentB = await createEnrolledStudent(prisma, {
    schoolId: schoolB.id,
    classId: classB.id,
    academicYearId: yearB.id,
    name: "Student B",
    dob: new Date("2016-01-01"),
    admissionNo: "B-101",
  });

  const result = await editStudent(prisma, {
    studentId: studentB.id,
    schoolId: schoolB.id,
    academicYearId: yearB.id,
    fields: { parents: [{ relationship: "Father", name: "Shared Parent", phone: "+15550008888" }] },
  });

  expect(result).toMatchObject({ ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" });
});
```

- [ ] **Step 6: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "editStudent when the new parent phone"
```
Expected: FAIL

- [ ] **Step 7: Add the error variant and the check in `editStudent`**

Extend the union at line 216-224:

```typescript
export type EditStudentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "DUPLICATE_STUDENT_ID" }
  | { ok: false; error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SIBLING" }
  | { ok: false; error: "NO_ACTIVE_ENROLLMENT" };
```

Add a pre-transaction check right after the `siblingStudentIds` block (after line 266, before the enrollment block at line 268), so a bad phone is rejected before any write starts:

```typescript
  if (params.fields.parents !== undefined) {
    for (const parentInput of params.fields.parents) {
      const existingParent = await prisma.user.findUnique({ where: { phone: parentInput.phone } });
      if (existingParent && existingParent.schoolId !== params.schoolId) {
        return { ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" };
      }
    }
  }
```

- [ ] **Step 8: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "editStudent when the new parent phone"
```
Expected: PASS

- [ ] **Step 9: Update the API route error mapping**

`apps/web/src/app/api/students/route.ts:96` already maps `PHONE_WRONG_ROLE` to an HTTP response — check that file for the surrounding `if/else if` chain and add a matching branch for `PHONE_BELONGS_TO_ANOTHER_SCHOOL` (same status code convention as `PHONE_WRONG_ROLE`, e.g. 400 with a clear message). Also check `apps/web/src/app/api/students/[id]/route.ts` (or wherever the edit endpoint lives) for the same mapping need.

- [ ] **Step 10: Run the full test suite**

```bash
cd apps/web && npm test
```
Expected: all tests pass (463 previous + 2 new = 465), 0 failures unrelated to this change.

- [ ] **Step 11: Typecheck and build**

```bash
cd apps/web && npx tsc --noEmit && npm run build
```
Expected: both clean.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/lib/school-setup/students.ts apps/web/src/app/api/students apps/web/tests/students-lib.test.ts
git commit -m "fix: reject parent phone reuse across schools in createStudent/editStudent"
```

---

### Task 2: Add the missing role check to `editStudent`

**Files:**
- Modify: `apps/web/src/lib/school-setup/students.ts:345-369`
- Test: `apps/web/tests/students-lib.test.ts`

**Interfaces:**
- Consumes: `PHONE_WRONG_ROLE` error variant (already exists on `CreateStudentResult`; this task adds it to `EditStudentResult`, alongside `PHONE_BELONGS_TO_ANOTHER_SCHOOL` added in Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
it("rejects editStudent when a parent phone belongs to a non-parent user in the same school", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  const year = await createActiveYear(prisma, school.id);
  const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

  const teacher = await prisma.user.create({
    data: { schoolId: school.id, phone: "+15550007777", name: "A Teacher", role: "teacher" },
  });

  const student = await createEnrolledStudent(prisma, {
    schoolId: school.id,
    classId: klass.id,
    academicYearId: year.id,
    name: "Existing",
    dob: new Date("2016-01-01"),
    admissionNo: "SCH-200",
  });

  const result = await editStudent(prisma, {
    studentId: student.id,
    schoolId: school.id,
    academicYearId: year.id,
    fields: { parents: [{ relationship: "Father", name: teacher.name, phone: teacher.phone }] },
  });

  expect(result).toMatchObject({ ok: false, error: "PHONE_WRONG_ROLE" });

  const unchangedTeacher = await prisma.user.findUnique({ where: { id: teacher.id } });
  expect(unchangedTeacher).toMatchObject({ role: "teacher", name: "A Teacher" });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "non-parent user in the same school"
```
Expected: FAIL — today this silently renames the teacher and grants them a `ParentStudent` link.

- [ ] **Step 3: Add `PHONE_WRONG_ROLE` to `EditStudentResult` and check it**

Union (building on Task 1's edit):

```typescript
export type EditStudentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "DUPLICATE_STUDENT_ID" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SIBLING" }
  | { ok: false; error: "NO_ACTIVE_ENROLLMENT" };
```

Extend the pre-transaction loop added in Task 1 Step 7:

```typescript
  if (params.fields.parents !== undefined) {
    for (const parentInput of params.fields.parents) {
      const existingParent = await prisma.user.findUnique({ where: { phone: parentInput.phone } });
      if (existingParent && existingParent.role !== "parent") {
        return { ok: false, error: "PHONE_WRONG_ROLE" };
      }
      if (existingParent && existingParent.schoolId !== params.schoolId) {
        return { ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" };
      }
    }
  }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "non-parent user in the same school"
```
Expected: PASS

- [ ] **Step 5: Update the API route error mapping**

Add the `PHONE_WRONG_ROLE` branch to the edit-student API route's error-to-response mapping (same file(s) touched in Task 1 Step 9).

- [ ] **Step 6: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/school-setup/students.ts apps/web/src/app/api/students apps/web/tests/students-lib.test.ts
git commit -m "fix: reject editStudent parent-phone reuse for non-parent accounts"
```

---

### Task 3: Re-check `user.status` in the auth guards

**Scope correction from the audit:** the audit names two guards (`require-api-role.ts`, `require-dashboard-role.ts`). There is a **third** with the identical hole, `require-parent-role.ts`, called from 10 more files — fix all three together since they share one root cause.

All three are **synchronous** functions that read the session cookie via Next 14's synchronous `cookies()` and either `throw new AuthError(...)` (`requireApiRole`) or call `redirect("/login")` (`requireDashboardRole`, `requireParentRole`) — there is no `Request` object involved and no async DB call today. Making them check `user.status` requires a Prisma query, which means all three become `async`, which means every call site (`const claims = requireApiRole(...)`) needs `await` added. Verified call-site counts: **46 files** call `requireApiRole`, **21 files** call `requireDashboardRole`, **10 files** call `requireParentRole` — all inside `async function` route handlers or async Server Components (confirmed for a sample of each), so `await` is safe to add everywhere. Confirmed `UserStatus` enum (`prisma/schema.prisma:18-21`) has exactly two values: `active`, `inactive`.

Don't hand-edit all 77 call sites blind. Change the function signatures first, then let `tsc --noEmit` enumerate every site that's now a type error (a `Promise<SessionClaims>` used where `SessionClaims` is expected) — that turns a large manual refactor into a compiler-guided one where a missed site fails the build, not silently ships.

**Files:**
- Modify: `apps/web/src/lib/auth/require-api-role.ts` (currently 17 lines, full contents below), `apps/web/src/lib/auth/require-dashboard-role.ts` (21 lines), `apps/web/src/lib/auth/require-parent-role.ts` (13 lines)
- Modify: every call site `tsc` flags after Step 4 (77 files across `apps/web/src/app/**`)
- Test: extend the existing `apps/web/tests/require-api-role.test.ts`, `apps/web/tests/require-dashboard-role.test.ts`, `apps/web/tests/require-parent-role.test.ts` (all three already exist — do not create new files)

**Interfaces:**
- `requireApiRole(allowedRoles: SessionClaims["role"][]): SessionClaims` → becomes `Promise<SessionClaims>`, same throw-`AuthError` behavior on failure, now also throws `AuthError(401, ...)` when the DB user is missing/inactive.
- `requireDashboardRole(allowedRoles): SessionClaims` → becomes `Promise<SessionClaims>`, same `redirect("/login")`/`redirect("/dashboard")` behavior, now also redirects to `/login` when the DB user is inactive.
- `requireParentRole(): SessionClaims` → becomes `Promise<SessionClaims>`, same `redirect("/login")` behavior, now also redirects when the DB user is inactive.

- [ ] **Step 1: Write the failing test for `requireApiRole`**

Current full contents of `apps/web/tests/require-api-role.test.ts` should already have a `describe`/`resetDb` scaffold matching the other lib tests — add this case to it (adjust the `describe` block's existing imports rather than duplicating them):

```typescript
it("rejects a request from a user whose status is inactive, even with a valid session", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  const teacher = await prisma.user.create({
    data: { schoolId: school.id, phone: "+15550006666", name: "A Teacher", role: "teacher", status: "active" },
  });

  // signSessionToken / SessionClaims come from ../src/lib/auth/jwt — see that file's actual exports
  const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });

  await prisma.user.update({ where: { id: teacher.id }, data: { status: "inactive" } });

  // requireApiRole reads the cookie via next/headers cookies() internally — check how the
  // existing tests in this file simulate a request cookie (likely a next/headers mock or
  // a helper that sets the cookie store) and reuse that exact mechanism here with `token`.

  await expect(requireApiRole(["teacher", "admin"])).rejects.toMatchObject({ status: 401 });
});
```

> Before writing this, read `apps/web/tests/require-api-role.test.ts` in full — it already has at least one passing test exercising `requireApiRole`, which shows the exact mechanism used to inject a session cookie into the `next/headers` mock in this test environment. Copy that mechanism; don't invent a new one.

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/require-api-role.test.ts -t "inactive"
```
Expected: FAIL — `requireApiRole` currently only checks the JWT signature/expiry, never the DB, so a deactivated user's still-valid cookie passes and the promise resolves instead of rejecting.

- [ ] **Step 3: Repeat Step 1-2 for the other two guards**

Add equivalent cases to `apps/web/tests/require-dashboard-role.test.ts` and `apps/web/tests/require-parent-role.test.ts`. Since these call `redirect()` rather than throwing, follow whichever pattern the existing passing tests in those files already use to assert a redirect happened (Next's `redirect()` throws a special internal error in the App Router — the existing tests almost certainly already catch and assert on this; mirror that exact pattern for the inactive-user case, asserting redirect to `/login`).

- [ ] **Step 4: Convert all three guards to async and add the DB check**

```typescript
// require-api-role.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma"; // confirm this is the actual shared-client import path used elsewhere in the codebase
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import { AuthError } from "./rbac";
import type { SessionClaims } from "./jwt";

export async function requireApiRole(allowedRoles: SessionClaims["role"][]): Promise<SessionClaims> {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims) {
    throw new AuthError(401, "Not authenticated");
  }

  if (!allowedRoles.includes(claims.role)) {
    throw new AuthError(403, "Role not permitted for this resource");
  }

  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { status: true } });
  if (!user || user.status !== "active") {
    throw new AuthError(401, "Account is no longer active");
  }

  return claims;
}
```

```typescript
// require-dashboard-role.ts — same DB check, placed before the final `return claims;`,
// using redirect("/login") instead of throwing, matching this file's existing style:
export async function requireDashboardRole(allowedRoles: SessionClaims["role"][]): Promise<SessionClaims> {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims || !STAFF_ROLES.includes(claims.role)) {
    redirect("/login");
  }

  if (!allowedRoles.includes(claims.role)) {
    redirect("/dashboard");
  }

  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { status: true } });
  if (!user || user.status !== "active") {
    redirect("/login");
  }

  return claims;
}
```

```typescript
// require-parent-role.ts — same pattern, no allowedRoles param:
export async function requireParentRole(): Promise<SessionClaims> {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims || claims.role !== "parent") {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { status: true } });
  if (!user || user.status !== "active") {
    redirect("/login");
  }

  return claims;
}
```

- [ ] **Step 5: Let the compiler find every call site**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "require(Api|Dashboard|Parent)Role" | head -50
```
This will list every file still calling these functions without `await`, with a type error like "Property 'role' does not exist on type 'Promise<SessionClaims>'". Fix each by adding `await` in front of the call:

```typescript
const claims = await requireApiRole(["teacher", "admin"]);
```

Re-run the `tsc` command after each batch of fixes until it returns no matches for these three function names. Given the volume (77 sites), work through them file-by-file rather than trying to script a blind find-and-replace — a handful of call sites may be inside non-async helper functions that themselves need to become `async` and have their own callers updated, which `tsc` will also surface one layer at a time.

- [ ] **Step 6: Run the three guard tests to confirm they pass**

```bash
cd apps/web && npx vitest run tests/require-api-role.test.ts tests/require-dashboard-role.test.ts tests/require-parent-role.test.ts
```
Expected: PASS, including the new inactive-user cases.

- [ ] **Step 7: Run the full suite**

```bash
cd apps/web && npm test
```
Expected: all pass. This is the step most likely to surface collateral damage from the async conversion (e.g. a test that called one of these guards synchronously and asserted on the return value directly) — fix any such test to `await` the call rather than changing the guard back.

- [ ] **Step 8: Typecheck and build**

```bash
cd apps/web && npx tsc --noEmit && npm run build
```
Expected: both clean — a clean `tsc` here is the actual proof that Step 5 found every call site.

- [ ] **Step 9: Commit**

Given the size, commit as one unit (the async conversion isn't meaningfully separable from the call-site updates it forces):

```bash
git add apps/web/src/lib/auth/require-api-role.ts apps/web/src/lib/auth/require-dashboard-role.ts apps/web/src/lib/auth/require-parent-role.ts apps/web/src/app apps/web/tests/require-api-role.test.ts apps/web/tests/require-dashboard-role.test.ts apps/web/tests/require-parent-role.test.ts
git commit -m "fix: re-check user.status on every request across all three auth guards, not just at login"
```

**Note:** this closes the "deactivated user keeps access for 30 days" hole but does **not** add session revocation (an admin still can't force-expire one specific token before its 30-day JWT expiry — a deactivated-then-reactivated-then-deactivated-again user within the same 30 days would need this check to run fresh each time, which it now does, but there's still no way to invalidate one specific already-issued token on demand). A session/token table or short-lived-JWT-plus-refresh scheme is a larger feature — track separately, not in this task.

---

### Task 4: Add database indexes

**Files:**
- Create: `apps/web/prisma/migrations/<timestamp>_add_missing_indexes/migration.sql` (via `prisma migrate dev`, not hand-written)
- Modify: `apps/web/prisma/schema.prisma`

**Interfaces:**
- Produces: no code-level interface change — this is schema-only. Every model with an unindexed foreign key used in a `where` clause elsewhere in the codebase gets an explicit `@@index`.

- [ ] **Step 1: Enumerate every FK that needs an index**

```bash
cd apps/web && grep -n "@relation(fields:" prisma/schema.prisma
```
Cross-reference against `grep -rn "@@index\|@@unique" prisma/schema.prisma` to find which FK columns are *not* already covered by a `@@unique`/`@@id`. Confirmed by the audit and independently verified as needing an index: `Notification.userId`, `OtpCode.phone`, `Assignment.classId`, `Mark.studentId`, `AssignmentStatus.studentId`, `ClassTeacher.teacherUserId`, `ParentStudent.studentId`. Add every other unindexed FK found by the grep above — treat the audit's list as a floor, not a ceiling.

- [ ] **Step 2: Add `@@index` declarations to `schema.prisma`**

Example for the two worst offenders named in the audit:

```prisma
model Notification {
  id        Int       @id @default(autoincrement())
  user      User      @relation(fields: [userId], references: [id])
  userId    Int
  type      String
  title     String
  body      String
  relatedId Int?
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

model OtpCode {
  id        Int       @id @default(autoincrement())
  phone     String
  codeHash  String
  salt      String
  expiresAt DateTime
  attempts  Int       @default(0)
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([phone])
}
```

Repeat for every FK enumerated in Step 1.

- [ ] **Step 3: Generate the migration**

```bash
cd apps/web && npx prisma migrate dev --name add_missing_indexes
```
This creates a `CREATE INDEX` migration and applies it to your local dev DB. Review the generated SQL — it should contain only `CREATE INDEX` statements, no data changes.

- [ ] **Step 4: Confirm the test suite still passes against the new schema**

```bash
cd apps/web && npm test
```
Expected: all pass — this is a purely additive schema change, nothing should break.

- [ ] **Step 5: Verify `prisma validate` and a clean generate**

```bash
cd apps/web && npx prisma validate && npx prisma generate
```

- [ ] **Step 6: Typecheck and build**

```bash
cd apps/web && npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations
git commit -m "perf: add missing indexes on foreign-key columns"
```

**Follow-up outside this task's scope:** `OtpCode` has no cleanup job and grows forever even with an index — worth a scheduled deletion of expired/used rows, tracked separately.

---

### Task 5: Wrap `recordPayment` in a transaction

Verified actual signature (`apps/web/src/lib/fee-payments.ts:64-128`):

```typescript
export type RecordPaymentResult =
  | { ok: true; amountPaid: number; status: FeeStatus }
  | { ok: false; error: "INVALID_FEE_STRUCTURE" }
  | { ok: false; error: "STUDENT_MISMATCH" }
  | { ok: false; error: "INVALID_AMOUNT" }
  | { ok: false; error: "EXCEEDS_AMOUNT_DUE" };

export async function recordPayment(
  prisma: PrismaClient,
  params: { feeStructureId: number; studentId: number; schoolId: number; recordedById: number; amount: number }
): Promise<RecordPaymentResult>
```

It's called only from `apps/web/src/app/api/fee-payments/route.ts`'s `POST` handler — there is no separate lib-level test file, `apps/web/tests/fee-payments-api.test.ts` tests it exclusively through that route using a `seedSchoolWithFeeStructure()` helper and a `loginAs(userId, role, schoolId)` helper already defined near the top of that file (mocks `next/headers` cookies via `vi.mock`). Reuse both.

**Files:**
- Modify: `apps/web/src/lib/fee-payments.ts:64-128`
- Test: `apps/web/tests/fee-payments-api.test.ts` (extend the existing file — do not create a new one)

**Interfaces:**
- Consumes: nothing new.
- Produces: same `recordPayment` signature and same `RecordPaymentResult` shape — this task changes *how* the write happens (atomically), not the function's external contract.

- [ ] **Step 1: Write the failing concurrency test**

Add to `apps/web/tests/fee-payments-api.test.ts`, inside the existing `describe` block, after the other `POST` tests:

```typescript
it("does not lose a payment when two POSTs race on the same student/fee", async () => {
  const { school, student, feeStructure } = await seedSchoolWithFeeStructure(); // amount: 5000, per the existing helper
  const admin = await prisma.user.create({
    data: { phone: "+15550114444", role: "admin", name: "Test Admin", schoolId: school.id },
  });
  loginAs(admin.id, "admin", school.id);

  function pay(amount: number) {
    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount }),
      headers: { "content-type": "application/json" },
    });
    return postFeePayments(request);
  }

  const [r1, r2] = await Promise.all([pay(2000), pay(3000)]);

  expect(r1.status).toBe(200);
  expect(r2.status).toBe(200);

  const rows = await prisma.feePayment.findMany({ where: { studentId: student.id } });
  expect(rows).toHaveLength(1);
  expect(rows[0].amountPaid).toBe(5000); // both payments must be reflected, not just the last writer's
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/fee-payments-api.test.ts -t "does not lose a payment"
```
Expected: FAIL — final `amountPaid` lands at `2000` or `3000`, never `5000`, because both requests read `existingAmountPaid: 0` before either write commits.

- [ ] **Step 3: Make the read-check-write atomic**

Replace the body of `recordPayment` in `apps/web/src/lib/fee-payments.ts:64-128`, preserving every existing check and error code exactly, moving all of them inside a `Serializable` transaction so Postgres itself rejects the write-skew race rather than relying on read-then-write timing:

```typescript
export async function recordPayment(
  prisma: PrismaClient,
  params: {
    feeStructureId: number;
    studentId: number;
    schoolId: number;
    recordedById: number;
    amount: number;
  }
): Promise<RecordPaymentResult> {
  return prisma.$transaction(
    async (tx) => {
      const feeStructure = await tx.feeStructure.findFirst({
        where: { id: params.feeStructureId, schoolId: params.schoolId },
      });
      if (!feeStructure) return { ok: false, error: "INVALID_FEE_STRUCTURE" };

      const enrollment = await tx.enrollment.findFirst({
        where: {
          studentId: params.studentId,
          classId: feeStructure.classId,
          academicYearId: feeStructure.academicYearId,
          status: "active",
        },
      });
      if (!enrollment) return { ok: false, error: "STUDENT_MISMATCH" };
      if (params.amount <= 0) return { ok: false, error: "INVALID_AMOUNT" };

      const existing = await tx.feePayment.findUnique({
        where: {
          studentId_feeStructureId: { studentId: params.studentId, feeStructureId: params.feeStructureId },
        },
      });
      const existingAmountPaid = existing ? existing.amountPaid : 0;
      const newAmountPaid = existingAmountPaid + params.amount;

      if (newAmountPaid > feeStructure.amount) return { ok: false, error: "EXCEEDS_AMOUNT_DUE" };

      const status = computeFeeStatus(newAmountPaid, feeStructure.amount);
      await tx.feePayment.upsert({
        where: {
          studentId_feeStructureId: { studentId: params.studentId, feeStructureId: params.feeStructureId },
        },
        create: {
          studentId: params.studentId,
          feeStructureId: params.feeStructureId,
          amountPaid: newAmountPaid,
          paidDate: new Date(),
          recordedById: params.recordedById,
          status,
        },
        update: {
          amountPaid: newAmountPaid,
          paidDate: new Date(),
          recordedById: params.recordedById,
          status,
        },
      });

      return { ok: true, amountPaid: newAmountPaid, status };
    },
    { isolationLevel: "Serializable" }
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/fee-payments-api.test.ts -t "does not lose a payment"
```
Expected: PASS. If a `Serializable` conflict surfaces as a thrown Prisma error instead of one call cleanly losing, that error will currently bubble up as an unhandled 500 from the `POST` route handler — check `apps/web/src/app/api/fee-payments/route.ts`'s try/catch and add a retry-once-then-500 or a caught-and-mapped response if the route doesn't already handle transaction conflicts. Confirm this against whatever the route file's existing catch block does before adding new handling.

- [ ] **Step 5: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/fee-payments.ts apps/web/tests/fee-payments-api.test.ts
git commit -m "fix: make recordPayment atomic to stop concurrent payments overwriting each other"
```

**Explicitly out of scope for this task** (tracked as separate backlog items, see Phase 2/3 below): the payment ledger (currently one mutable row per student/fee, no history), and `Float`/`double precision` currency storage (needs a `Decimal` migration — a bigger, riskier change that deserves its own plan).

---

### Task 6: Guard the promotion state machine on `run.status`

Verified actual code (`apps/web/src/lib/promotion.ts:323-397`):

```typescript
export type ConfirmPromotionRunResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "UNDECIDED_STUDENTS" };

export async function confirmPromotionRun(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<ConfirmPromotionRunResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
  });
  if (!run) return { ok: false, error: "NOT_FOUND" };
  // ... no run.status check here — proceeds straight into the confirm transaction ...
```

`PromotionRunStatus` (`prisma/schema.prisma:57-61`) has exactly three values: `draft`, `confirmed`, `reverted`. `revertPromotionRun` (line 409) already guards correctly with `if (run.status !== "confirmed") return { ok: false, error: "NOT_CONFIRMED" };` — `confirmPromotionRun` has no equivalent, so calling it a second time re-runs the entire archive/activate/enrollment-creation transaction using the same (possibly stale) decisions.

**Files:**
- Modify: `apps/web/src/lib/promotion.ts:323-397` (`confirmPromotionRun`)
- Test: `apps/web/tests/promotion-engine.test.ts` — extend the existing `describe("confirmPromotionRun / revertPromotionRun", ...)` block (starts at line 426), which already has a `seedReadyRun()` helper (lines 436-525) that builds a school, two academic years, three students in various decision states, and drives `startOrResumePromotionRun` → `updateMappings` → `setStudentDecisions` to produce a run that's ready to confirm, returning `{ school, fromYear, toYear, gradeOne, gradeTwo, promotedStudent, retainedStudent, graduatedStudent, runId }`. Reuse it — don't rebuild this setup.

**Interfaces:**
- Produces: new error variant `{ ok: false; error: "ALREADY_CONFIRMED" }` on `ConfirmPromotionRunResult`.

- [ ] **Step 1: Write the failing test**

Add to the `describe("confirmPromotionRun / revertPromotionRun", ...)` block in `apps/web/tests/promotion-engine.test.ts`, alongside its sibling tests (e.g. right after the "archives the old year..." test at line 527):

```typescript
it("rejects confirming a run that is already confirmed", async () => {
  const { school, runId } = await seedReadyRun();
  const { confirmPromotionRun } = await import("../src/lib/promotion");

  const first = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
  expect(first).toMatchObject({ ok: true });

  const second = await confirmPromotionRun(prisma, { promotionRunId: runId, schoolId: school.id });
  expect(second).toMatchObject({ ok: false, error: "ALREADY_CONFIRMED" });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/promotion-engine.test.ts -t "already confirmed"
```
Expected: FAIL — today the second call succeeds (`ok: true`) and re-runs the whole promotion transaction a second time.

- [ ] **Step 3: Add the guard**

In `apps/web/src/lib/promotion.ts`, extend the union and add the check right after the existing `NOT_FOUND` guard (line 336):

```typescript
export type ConfirmPromotionRunResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "ALREADY_CONFIRMED" }
  | { ok: false; error: "UNDECIDED_STUDENTS" };

export async function confirmPromotionRun(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<ConfirmPromotionRunResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
  });
  if (!run) return { ok: false, error: "NOT_FOUND" };
  if (run.status === "confirmed") return { ok: false, error: "ALREADY_CONFIRMED" };
  // ... rest unchanged ...
```

- [ ] **Step 4: Check `updateMappings` and `setStudentDecisions` for the same gap**

```bash
cd apps/web && sed -n '87,142p;200,290p' src/lib/promotion.ts
```
The audit claims these two also let a confirmed run's decisions stay editable with no `run.status` guard. Verify directly rather than assuming the claim still holds (Task 1 already found one stale audit reference). If confirmed, add the identical `if (run.status === "confirmed") return { ok: false, error: "ALREADY_CONFIRMED" };` guard to each, extending their result-type unions the same way, and add one test per function mirroring Step 1's shape (seed via `seedReadyRun()`, confirm the run, then call `updateMappings`/`setStudentDecisions` and assert the new error).

- [ ] **Step 5: Run the test(s) to confirm they pass**

```bash
cd apps/web && npx vitest run tests/promotion-engine.test.ts -t "already confirmed"
```
Expected: PASS for all cases added in Steps 1 and 4.

- [ ] **Step 6: Update the API route error mappings**

```bash
cd apps/web && grep -rln "confirmPromotionRun\|updateMappings\|setStudentDecisions" src/app/api
```
Add the `ALREADY_CONFIRMED` branch to each route file's error-to-HTTP-response mapping.

- [ ] **Step 7: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/promotion.ts apps/web/src/app/api apps/web/tests/promotion-engine.test.ts
git commit -m "fix: prevent re-confirming or re-editing an already-confirmed promotion run"
```

**Explicitly out of scope for this task:** the audit's separate finding that promotion holds one transaction open across thousands of sequential per-student round trips (`promotion.ts:378-457`) is a performance/scalability rewrite, not a correctness bug fixable by a status guard — it needs its own plan (batching the per-student writes, e.g. `createMany`/`updateMany` instead of an awaited loop).

---

### Task 7: Stand up CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: a GitHub Actions workflow that runs on every push and PR, gating merges on lint (if a linter is configured — see note below), `tsc --noEmit`, `npm test`, and `npm run build`.

- [ ] **Step 1: Confirm there is a test-database setup script or documented `DATABASE_URL` convention**

```bash
cd apps/web && cat package.json | grep -A3 '"scripts"' && cat vitest.config.ts && cat .env.example 2>/dev/null
```
Tests run against a real Postgres (`fileParallelism: false` per the audit) — CI needs a Postgres service container with the same `DATABASE_URL` shape the test suite expects, and needs `prisma migrate deploy` (not `migrate dev`) run against it before tests start.

- [ ] **Step 2: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: school_info_system_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/school_info_system_test
      JWT_SECRET: ci-test-secret-do-not-use-in-production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: apps/web/package-lock.json
      - name: Install dependencies
        working-directory: apps/web
        run: npm ci
      - name: Run migrations
        working-directory: apps/web
        run: npx prisma migrate deploy
      - name: Typecheck
        working-directory: apps/web
        run: npx tsc --noEmit
      - name: Test
        working-directory: apps/web
        run: npm test
      - name: Build
        working-directory: apps/web
        run: npm run build
```

> Adjust `working-directory`, the lockfile path, and env var names to match whatever Step 1 actually found (in particular: confirm the real env var names the app reads for its DB connection and JWT secret — `JWT_SECRET` is a guess based on the audit's mention of it, verify against `apps/web/src/lib/auth/jwt.ts` and `.env.example`).

- [ ] **Step 3: Push a branch and confirm the workflow runs**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow running typecheck, tests, and build"
git push -u origin HEAD
```
Open the PR / check the Actions tab and confirm the job goes green. If migrations fail because `migrate deploy` expects an already-baselined DB, check `prisma/migrations/migration_lock.toml` and adjust.

- [ ] **Step 4: Add a branch protection note (manual, not code)**

Once the workflow is green at least once, go to the repo's Settings → Branches and require this check to pass before merging to `main`. This step has no code artifact — note it in the PR description as a manual follow-up for whoever has admin rights on the GitHub repo.

**Note:** the audit found "no linter configured at all" — no ESLint config exists, and Next 16 removed `next lint` (moot here since this repo is on Next 14, which still ships `next lint`, but no lint script exists in `package.json` either way per the audit). Adding a linter is valuable but is a separate, larger task (choosing a config, fixing whatever it flags across the whole codebase) — don't bundle it into standing up CI. Ship CI with typecheck+test+build first; add a `lint` job in a follow-up PR once ESLint is actually configured.

---

### Task 8: Move uploads off `public/` — **requires an infrastructure decision from you**

The three upload routes (`assignments/upload/route.ts:37-42`, `students/upload-photo/route.ts:36-41`, `school/logo/route.ts:37-42`) write into `process.cwd()/public/uploads/...`, which is read-only on Vercel and ephemeral on any container platform — files vanish on the next deploy. Fixing this requires **choosing and provisioning a real storage backend** (S3, Cloudflare R2, Vercel Blob, Google Cloud Storage, etc.) and getting credentials into the environment — that's a decision only you can make (cost, existing infra, region requirements), not something to guess at in a plan.

**Recommended shape once you've picked a provider** (this part is mechanical and can be written as a full task once the provider is chosen):
1. Introduce a small `Storage` interface (`put(key, buffer): Promise<url>`) analogous to the existing `SmsSender` interface pattern in `lib/auth/sms-sender.ts` — one interface, one real implementation, swap in tests with a stub.
2. Replace the three routes' `writeFile` calls with calls to this interface.
3. Serve files through a signed/expiring URL (this also closes the audit's separate "uploaded photos have no authorization" finding — a signed URL is both the storage fix and the access-control fix).
4. Add a data migration note (not a code migration) for any already-uploaded files sitting in `public/uploads/` in whatever environment is live today, since they'll need to be copied to the new backend or accepted as lost.

**Action for you before this becomes an executable task:** pick a storage provider and confirm whether any files currently in a deployed environment's `public/uploads/` need to be preserved. Once decided, this becomes Task 8 of a follow-up plan.

---

### Task 9: Wire a real SMS provider — **requires a vendor decision from you**

`lib/auth/sms-sender.ts` only has `ConsoleSmsSender`, which logs the OTP to the server console — no parent, teacher, or admin can log in from a real phone today. This is the hard launch blocker, but picking a provider (Twilio, MSG91, Gupshup, AWS SNS — MSG91/Gupshup are the common choices for Indian phone numbers given the audit's "Indian K-12 market" framing) and getting API credentials is a business decision, not a code one.

**Recommended shape once you've picked a provider:**
1. Add a `TwilioSmsSender` (or equivalent) implementing the existing `SmsSender` interface — this is already designed for exactly this swap (`interface SmsSender { send(phone, message): Promise<void> }`), so no refactor is needed, just a new implementation class.
2. Read provider credentials from environment variables, following whatever env-var convention the rest of the codebase uses (check how `JWT_SECRET` is read in `jwt.ts` for the pattern).
3. Select the real implementation vs. `ConsoleSmsSender` based on `NODE_ENV` or an explicit env flag, so local dev and CI (Task 7) keep using the console sender without needing real credentials.
4. Add a test that the wiring picks the right implementation per environment (this can and should be a real task with real TDD steps once the provider is chosen) — but do **not** write a test that calls the real provider's API in CI; stub the HTTP call.

**Action for you before this becomes an executable task:** pick an SMS provider and get API credentials (sandbox credentials are enough to start the implementation). Once decided, this becomes Task 9 of a follow-up plan.

---

## What this plan deliberately does not cover

The audit found 21 high-severity issues and 30+ medium/low issues beyond the 9 above, plus a list of product/launch gaps. Per the writing-plans scope guidance, those are independent subsystems (auth hardening, attendance timezone handling, frontend loading states, ops/monitoring, and outright missing features like bulk CSV import, an audit log, and DPDP consent capture) and belong in their own plans rather than bolted onto this one. A prioritized backlog for reference:

**Phase 2 candidates (high severity, mechanical fixes, no external dependencies):**
- OTP attempt counter is written but never read (`verify-otp.ts:29-33`) — trivial fix, add the check.
- OTP phone enumeration (`send-otp/route.ts:23-26` returns 404/200 differently) — return identical responses for known/unknown numbers.
- No rate limiting anywhere in the repo — needs a decision on in-memory vs. Redis-backed limiter depending on deploy target.
- Attendance "today" computed via `new Date().toISOString().slice(0,10)` in four places — UTC-vs-IST off-by-one bug, needs a school-timezone-aware date helper.
- `marks.ts:114` accepts `null` past validation (`null >= 0` is `true` in JS) — add an explicit `Number.isFinite` check.
- No phone number format validation/normalization on student/staff creation.
- No pagination on `listStudents`/staff list endpoints.
- Zero `loading.tsx`/`error.tsx`/`not-found.tsx` files under `src/app` — no Suspense boundaries anywhere.
- `dashboard/overview.ts` N+1 query loops — batch with `Promise.all`.
- `timetable.ts`/`classes.ts` update paths (`editTimetableEntry`, `editClass`) skip the tenant-ownership checks their create paths perform — same shape as Task 1/2's pattern, needs a shared `assertBelongsToSchool` helper per the audit's own recommendation.
- No teacher double-booking detection in the timetable (schema's only constraint is `[classId, dayOfWeek, periodId, academicYearId]`, nothing references `teacherUserId`) — needs a new uniqueness constraint or application-level clash check plus a product decision on how to represent rooms/venues (currently no such concept exists at all).

**Phase 3 candidates (product/launch gaps — features, not bugs):**
- Bulk CSV import for students/staff.
- An `AuditLog` model and write-path for fee/grade/attendance/promotion changes.
- DPDP Act consent capture + data export/erasure (currently a student with any attendance record can never be deleted, only deactivated — genuine erasure is architecturally blocked today).
- Payment ledger (append-only payment history instead of one mutable row per student/fee) and a `Decimal`-based currency migration off `Float`.
- Verified DB backup/restore runbook.
- Online payment gateway integration (Razorpay/PayU).
- Report-card PDF generation with a real grading-scale engine (`Mark.grade` is currently free text).

Say the word when you want a plan for any of these and it'll get the same file:line-grounded, TDD-structured treatment as the tasks above.
