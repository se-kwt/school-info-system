# Parent Login & Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `parent`-role user log in through the existing OTP flow and land on a minimal read-only `/parent` home page showing their child's attendance, assignments, marks, and fees.

**Architecture:** Reuse the existing OTP/JWT session pipeline unchanged. Add a `role` field to the session-verification response so the shared `/login` page can branch its redirect. Add a parent-only route guard (`requireParentRole`) mirroring the existing `requireDashboardRole`. Add a new `src/lib/parent/overview.ts` data module that reads `Attendance`/`AssignmentStatus`/`Mark`/`FeePayment` directly by `studentId` (authorized via the caller having already resolved that student through the parent's `ParentStudent` links). Add a new `/parent` route (layout + page) with a child-switcher and four summary cards styled after the existing `KpiCard` visual language.

**Tech Stack:** Next.js (App Router) route handlers + server components, Prisma/PostgreSQL, Vitest + Testing Library, Tailwind CSS.

## Global Constraints

- Auth pipeline (`send-otp`, `verify-otp` business logic, `jwt.ts`, `session-cookie.ts`) must not change its security behavior — only additive fields.
- All new Prisma queries that return a specific student's data must be reached only after confirming that `studentId` belongs to the calling parent via `ParentStudent` — never trust a raw `studentId` param.
- Follow existing code style: no comments unless explaining non-obvious "why", Tailwind utility classes matching the existing neutral/indigo/teal palette used in `KpiCard`/`Sidebar`/`StaffView`.
- Test file naming and structure matches existing `apps/web/tests/*.test.ts(x)` conventions (uses `tests/helpers/db.ts`'s `resetDb`/`prisma` and `prisma/fixtures.ts`'s `createSeedFixtures`).

---

### Task 1: Add `role` to the OTP verification result and session response

**Files:**
- Modify: `apps/web/src/lib/auth/verify-otp.ts`
- Modify: `apps/web/src/app/api/auth/session/route.ts`
- Test: `apps/web/tests/verify-otp.test.ts`
- Test: `apps/web/tests/session-route.test.ts`

**Interfaces:**
- Consumes: existing `SessionClaims["role"]` type from `apps/web/src/lib/auth/jwt.ts` (`"parent" | "teacher" | "admin" | "accountant"`).
- Produces: `VerifyOtpResult`'s success branch now also carries `role: SessionClaims["role"]`. `POST /api/auth/session`'s 200 response body is now `{ success: true, role: SessionClaims["role"] }` (was `{ success: true }`).

- [ ] **Step 1: Write the failing test for `verifyOtp` returning `role`**

Add this test to `apps/web/tests/verify-otp.test.ts`, right after the existing `"issues a session token for a correct, unexpired code"` test:

```ts
  it("returns the user's role alongside the session token", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550002223", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550002223", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    const result = await verifyOtp("+15550002223", code, { prisma });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("parent");
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/verify-otp.test.ts`
Expected: FAIL — `result.role` is `undefined`, `expect(undefined).toBe("parent")` fails (the `VerifyOtpResult` type doesn't have `role` yet either, so this would also fail to typecheck).

- [ ] **Step 3: Add `role` to `VerifyOtpResult` and the returned object**

In `apps/web/src/lib/auth/verify-otp.ts`, change the result type and the final return:

```ts
export type VerifyOtpResult =
  | { ok: true; token: string; role: SessionClaims["role"] }
  | { ok: false; error: "INVALID_CODE" | "EXPIRED" | "NOT_FOUND" };
```

This requires importing `SessionClaims`:

```ts
import type { PrismaClient } from "@prisma/client";
import { verifyOtpCode } from "./otp";
import { signSessionToken, type SessionClaims } from "./jwt";
```

And at the end of `verifyOtp`, change:

```ts
  return { ok: true, token };
```

to:

```ts
  return { ok: true, token, role: user.role };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/verify-otp.test.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Write the failing test for the session route returning `role`**

Add this test to `apps/web/tests/session-route.test.ts`, right after the existing `"sets an HttpOnly session cookie..."` test:

```ts
  it("includes the user's role in the response body", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550006667", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550006667", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ phone: "+15550006667", code }),
      headers: { "content-type": "application/json" },
    });

    const response = await sessionRoute(request);
    const body = await response.json();

    expect(body).toEqual({ success: true, role: "parent" });
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/session-route.test.ts`
Expected: FAIL — `body` is `{ success: true }`, missing `role`.

- [ ] **Step 7: Add `role` to the session route response**

In `apps/web/src/app/api/auth/session/route.ts`, change:

```ts
  const response = NextResponse.json({ success: true });
```

to:

```ts
  const response = NextResponse.json({ success: true, role: result.role });
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `cd apps/web && npx vitest run tests/verify-otp.test.ts tests/session-route.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/auth/verify-otp.ts apps/web/src/app/api/auth/session/route.ts apps/web/tests/verify-otp.test.ts apps/web/tests/session-route.test.ts
git commit -m "Include role in OTP verification and session response"
```

---

### Task 2: Route the shared login page by role

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`
- Test: `apps/web/tests/login-page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/session` response now includes `role` (Task 1) — the client reads `body.role` after a 200 response.
- Produces: no new exports; behavior change only (redirect target depends on role; heading text changes).

- [ ] **Step 1: Update the existing "navigates to /dashboard" test and add a parent-redirect test**

In `apps/web/tests/login-page.test.tsx`, replace the `"navigates to /dashboard after a successful code verification"` test's second mocked response (the `/api/auth/session` call) to include a role, and add a sibling test for the parent case. Replace this test:

```ts
  it("navigates to /dashboard after a successful code verification", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.type(screen.getByLabelText("Verification code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
  });
```

with:

```ts
  it("navigates to /dashboard after a successful code verification for a staff role", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, role: "teacher" }), { status: 200 })
      );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.type(screen.getByLabelText("Verification code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("navigates to /parent after a successful code verification for the parent role", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, role: "parent" }), { status: 200 })
      );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000004");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.type(screen.getByLabelText("Verification code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/parent");
    });
  });
```

Also update the heading assertion implicitly covered by rendering — no existing test asserts the "Staff Login" text, so no other edits are needed in this step.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/login-page.test.tsx`
Expected: FAIL — both new/updated tests expect `pushMock` to have been called with a role-dependent path, but the current page always pushes `/dashboard`.

- [ ] **Step 3: Update the login page to branch on role and rename the heading**

In `apps/web/src/app/login/page.tsx`, change `handleVerifyCode`:

```ts
  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });

    if (response.status === 200) {
      const body = await response.json();
      router.push(body.role === "parent" ? "/parent" : "/dashboard");
      return;
    }
    if (response.status === 401) {
      setError("Incorrect or expired code. Try again");
      return;
    }
    setError("Enter the code");
  }
```

And change the phone-step heading:

```tsx
        <h1 className="mb-4 text-xl font-semibold text-gray-800">Staff Login</h1>
```

to:

```tsx
        <h1 className="mb-4 text-xl font-semibold text-gray-800">Log in</h1>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/login-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/login/page.tsx apps/web/tests/login-page.test.tsx
git commit -m "Redirect login by role so parents land on /parent"
```

---

### Task 3: Add `requireParentRole` route guard

**Files:**
- Create: `apps/web/src/lib/auth/require-parent-role.ts`
- Test: `apps/web/tests/require-parent-role.test.ts`

**Interfaces:**
- Consumes: `verifySessionCookie`/`SESSION_COOKIE_NAME` from `apps/web/src/lib/auth/session-cookie.ts`; `SessionClaims` from `apps/web/src/lib/auth/jwt.ts`; `cookies` from `next/headers`; `redirect` from `next/navigation`.
- Produces: `requireParentRole(): SessionClaims` — throws (via `redirect`) to `/login` unless the session cookie decodes to `role === "parent"`; otherwise returns the claims. Used by `/parent/layout.tsx` in Task 7.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/require-parent-role.test.ts`:

```ts
import { vi } from "vitest";

const { cookieStore, redirectMock } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
  redirectMock: vi.fn((path: string) => {
    const error = new Error(`NEXT_REDIRECT:${path}`);
    throw error;
  }),
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

import { describe, it, expect, beforeEach } from "vitest";
import { requireParentRole } from "../src/lib/auth/require-parent-role";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireParentRole", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    redirectMock.mockClear();
  });

  it("returns claims when the session cookie has the parent role", () => {
    const token = signSessionToken({ userId: 1, role: "parent", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = requireParentRole();

    expect(claims.role).toBe("parent");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session cookie", () => {
    cookieStore.get.mockReturnValue(undefined);

    expect(() => requireParentRole()).toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login for a valid session with a staff role", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    expect(() => requireParentRole()).toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/require-parent-role.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/auth/require-parent-role'`

- [ ] **Step 3: Implement `requireParentRole`**

Create `apps/web/src/lib/auth/require-parent-role.ts`:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import type { SessionClaims } from "./jwt";

export function requireParentRole(): SessionClaims {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims || claims.role !== "parent") {
    redirect("/login");
  }

  return claims;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/require-parent-role.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth/require-parent-role.ts apps/web/tests/require-parent-role.test.ts
git commit -m "Add requireParentRole route guard for the parent area"
```

---

### Task 4: Parent data layer (`getParentChildren`, `getParentOverview`)

**Files:**
- Create: `apps/web/src/lib/parent/overview.ts`
- Test: `apps/web/tests/parent-overview.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `Student` from `@prisma/client`; `displayStatus` from `apps/web/src/lib/assignments.ts`.
- Produces:
  - `getParentChildren(prisma, parentUserId: number): Promise<Student[]>`
  - `ParentAssignmentEntry { id: number; subject: string; title: string; dueDate: string; status: "pending" | "overdue" }`
  - `ParentExamSubject { subject: string; marksObtained: number; maxMarks: number; grade: string }`
  - `ParentOverview { attendanceMonthPercent: number; upcomingAssignments: ParentAssignmentEntry[]; latestExam: { examName: string; term: string; subjects: ParentExamSubject[] } | null; feesOutstanding: { amount: number; nearestDueDate: string | null } }`
  - `getParentOverview(prisma, params: { studentId: number; schoolId: number }): Promise<ParentOverview>`
  - Both are consumed by `/parent/page.tsx` in Task 8.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/parent-overview.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getParentChildren, getParentOverview } from "../src/lib/parent/overview";

describe("getParentChildren", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns only the students linked to this parent", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const otherParent = await prisma.user.create({
      data: { phone: "+10000000005", role: "parent", name: "Other Parent", schoolId: fixtures.school.id },
    });
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Other Student",
        dob: new Date("2014-01-01"),
        admissionNo: "GH-2026-002",
      },
    });
    await prisma.parentStudent.create({
      data: { parentUserId: otherParent.id, studentId: otherStudent.id },
    });

    const children = await getParentChildren(prisma, fixtures.parent.id);

    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(fixtures.student.id);
  });
});

describe("getParentOverview", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("computes this month's attendance percent from present/late records", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2));
    const monthStart2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3));
    const monthStart3 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 4));

    await prisma.attendance.createMany({
      data: [
        { studentId: fixtures.student.id, date: monthStart, status: "present", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, date: monthStart2, status: "absent", markedById: fixtures.teacher.id },
        { studentId: fixtures.student.id, date: monthStart3, status: "late", markedById: fixtures.teacher.id },
      ],
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.attendanceMonthPercent).toBe(67);
  });

  it("returns up to 3 pending assignments ordered by due date, marking overdue ones", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 1000 * 60 * 60 * 24 * 9).toISOString().slice(0, 10);

    for (const [title, dueDate] of [
      ["Overdue Homework", past],
      ["Soon Homework", soon],
      ["Later Homework", later],
      ["Fourth Homework", later],
    ] as const) {
      const assignment = await prisma.assignment.create({
        data: {
          classId: fixtures.classA.id,
          subject: "Mathematics",
          title,
          dueDate: new Date(dueDate),
          createdById: fixtures.teacher.id,
          academicYearId: fixtures.academicYear.id,
        },
      });
      await prisma.assignmentStatus.create({
        data: { assignmentId: assignment.id, studentId: fixtures.student.id, status: "pending" },
      });
    }

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.upcomingAssignments).toHaveLength(3);
    expect(overview.upcomingAssignments[0].title).toBe("Overdue Homework");
    expect(overview.upcomingAssignments[0].status).toBe("overdue");
    expect(overview.upcomingAssignments[1].title).toBe("Soon Homework");
    expect(overview.upcomingAssignments[1].status).toBe("pending");
  });

  it("returns the most recent exam's full subject breakdown", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const olderExam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Mid Term",
        term: "Term 1",
        examDate: new Date("2026-08-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    const newerExam = await prisma.exam.create({
      data: {
        schoolId: fixtures.school.id,
        name: "Final Term",
        term: "Term 2",
        examDate: new Date("2026-12-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.mark.create({
      data: { examId: olderExam.id, studentId: fixtures.student.id, subject: "Mathematics", marksObtained: 80, maxMarks: 100, grade: "B" },
    });
    await prisma.mark.create({
      data: { examId: newerExam.id, studentId: fixtures.student.id, subject: "Mathematics", marksObtained: 91, maxMarks: 100, grade: "A" },
    });
    await prisma.mark.create({
      data: { examId: newerExam.id, studentId: fixtures.student.id, subject: "Science", marksObtained: 85, maxMarks: 100, grade: "B" },
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.latestExam?.examName).toBe("Final Term");
    expect(overview.latestExam?.subjects).toHaveLength(2);
    expect(overview.latestExam?.subjects.find((s) => s.subject === "Mathematics")?.marksObtained).toBe(91);
  });

  it("returns null latestExam when the student has no marks", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.latestExam).toBeNull();
  });

  it("sums outstanding fee amounts and finds the nearest unpaid due date", async () => {
    const fixtures = await createSeedFixtures(prisma);
    const nearFeeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 1",
        amount: 5000,
        dueDate: new Date("2026-09-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    const farFeeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: fixtures.school.id,
        classId: fixtures.classA.id,
        term: "Term 2",
        amount: 5000,
        dueDate: new Date("2026-12-01"),
        academicYearId: fixtures.academicYear.id,
      },
    });
    await prisma.feePayment.create({
      data: {
        studentId: fixtures.student.id,
        feeStructureId: nearFeeStructure.id,
        amountPaid: 2000,
        recordedById: fixtures.accountant.id,
        status: "partial",
      },
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.feesOutstanding.amount).toBe(3000 + 5000);
    expect(overview.feesOutstanding.nearestDueDate).toBe("2026-09-01");
    void farFeeStructure;
  });

  it("returns zero fees, no assignments, but still computes attendance/marks when the student has no active enrollment", async () => {
    const fixtures = await createSeedFixtures(prisma);
    await prisma.enrollment.updateMany({
      where: { studentId: fixtures.student.id },
      data: { status: "left" },
    });

    const overview = await getParentOverview(prisma, {
      studentId: fixtures.student.id,
      schoolId: fixtures.school.id,
    });

    expect(overview.upcomingAssignments).toEqual([]);
    expect(overview.feesOutstanding).toEqual({ amount: 0, nearestDueDate: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/parent-overview.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/parent/overview'`

- [ ] **Step 3: Implement `src/lib/parent/overview.ts`**

Create `apps/web/src/lib/parent/overview.ts`:

```ts
import type { PrismaClient, Student } from "@prisma/client";
import { displayStatus } from "../assignments";

export async function getParentChildren(
  prisma: PrismaClient,
  parentUserId: number
): Promise<Student[]> {
  const links = await prisma.parentStudent.findMany({
    where: { parentUserId },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });
  return links.map((link) => link.student);
}

export interface ParentAssignmentEntry {
  id: number;
  subject: string;
  title: string;
  dueDate: string;
  status: "pending" | "overdue";
}

export interface ParentExamSubject {
  subject: string;
  marksObtained: number;
  maxMarks: number;
  grade: string;
}

export interface ParentOverview {
  attendanceMonthPercent: number;
  upcomingAssignments: ParentAssignmentEntry[];
  latestExam: { examName: string; term: string; subjects: ParentExamSubject[] } | null;
  feesOutstanding: { amount: number; nearestDueDate: string | null };
}

function monthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function attendancePercent(records: { status: string }[]): number {
  if (records.length === 0) return 0;
  const attended = records.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

export async function getParentOverview(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number }
): Promise<ParentOverview> {
  const { start, end } = monthRange();
  const attendanceRecords = await prisma.attendance.findMany({
    where: { studentId: params.studentId, date: { gte: start, lt: end } },
    select: { status: true },
  });
  const attendanceMonthPercent = attendancePercent(attendanceRecords);

  const activeEnrollment = await prisma.enrollment.findFirst({
    where: { studentId: params.studentId, status: "active" },
  });

  let upcomingAssignments: ParentAssignmentEntry[] = [];
  let feesOutstanding: ParentOverview["feesOutstanding"] = { amount: 0, nearestDueDate: null };

  if (activeEnrollment) {
    const pendingStatuses = await prisma.assignmentStatus.findMany({
      where: {
        studentId: params.studentId,
        status: "pending",
        assignment: {
          classId: activeEnrollment.classId,
          academicYearId: activeEnrollment.academicYearId,
        },
      },
      include: { assignment: true },
      orderBy: { assignment: { dueDate: "asc" } },
      take: 3,
    });
    upcomingAssignments = pendingStatuses.map((entry) => ({
      id: entry.assignment.id,
      subject: entry.assignment.subject,
      title: entry.assignment.title,
      dueDate: entry.assignment.dueDate.toISOString().slice(0, 10),
      status: displayStatus(entry.status, entry.assignment.dueDate) === "overdue" ? "overdue" : "pending",
    }));

    const feeStructures = await prisma.feeStructure.findMany({
      where: { classId: activeEnrollment.classId, academicYearId: activeEnrollment.academicYearId },
      include: { payments: { where: { studentId: params.studentId } } },
      orderBy: { dueDate: "asc" },
    });
    let totalOutstanding = 0;
    let nearestDueDate: string | null = null;
    for (const structure of feeStructures) {
      const paid = structure.payments[0]?.amountPaid ?? 0;
      const outstanding = Math.max(0, structure.amount - paid);
      totalOutstanding += outstanding;
      if (outstanding > 0 && nearestDueDate === null) {
        nearestDueDate = structure.dueDate.toISOString().slice(0, 10);
      }
    }
    feesOutstanding = { amount: totalOutstanding, nearestDueDate };
  }

  const latestMark = await prisma.mark.findFirst({
    where: { studentId: params.studentId },
    include: { exam: true },
    orderBy: { exam: { examDate: "desc" } },
  });

  let latestExam: ParentOverview["latestExam"] = null;
  if (latestMark) {
    const examMarks = await prisma.mark.findMany({
      where: { studentId: params.studentId, examId: latestMark.examId },
    });
    latestExam = {
      examName: latestMark.exam.name,
      term: latestMark.exam.term,
      subjects: examMarks.map((mark) => ({
        subject: mark.subject,
        marksObtained: mark.marksObtained,
        maxMarks: mark.maxMarks,
        grade: mark.grade,
      })),
    };
  }

  return { attendanceMonthPercent, upcomingAssignments, latestExam, feesOutstanding };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/parent-overview.test.ts`
Expected: PASS

If the attendance percent test is flaky around month boundaries (it inserts on the 2nd/3rd/4th of the current month, so it's stable except when today is the 1st), that's an accepted, documented limitation — do not add retry logic for it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/parent/overview.ts apps/web/tests/parent-overview.test.ts
git commit -m "Add parent overview data layer (attendance, assignments, marks, fees)"
```

---

### Task 5: Child switcher component

**Files:**
- Create: `apps/web/src/components/parent/ChildSwitcher.tsx`
- Test: `apps/web/tests/child-switcher.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond plain data shapes.
- Produces: `ChildSwitcher({ students, activeStudentId }: { students: { id: number; name: string }[]; activeStudentId: number })` — a React server-renderable component (plain `<Link>`s, no client state) rendering nothing if `students.length <= 1`. The prop is named `students`, not `children`, to avoid colliding with React's special `children`-as-JSX-content convention. Consumed by `/parent/page.tsx` in Task 8.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/child-switcher.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChildSwitcher } from "../src/components/parent/ChildSwitcher";

describe("ChildSwitcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when there is only one child", () => {
    const { container } = render(
      <ChildSwitcher students={[{ id: 1, name: "Rohan Sharma" }]} activeStudentId={1} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a chip per child and marks the active one, linking by studentId", () => {
    render(
      <ChildSwitcher
        students={[
          { id: 1, name: "Rohan Sharma" },
          { id: 2, name: "Meera Sharma" },
        ]}
        activeStudentId={2}
      />
    );

    const rohanLink = screen.getByRole("link", { name: "Rohan Sharma" });
    const meeraLink = screen.getByRole("link", { name: "Meera Sharma" });

    expect(rohanLink).toHaveAttribute("href", "/parent?studentId=1");
    expect(meeraLink).toHaveAttribute("href", "/parent?studentId=2");
    expect(meeraLink).toHaveAttribute("aria-current", "true");
    expect(rohanLink).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/child-switcher.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/parent/ChildSwitcher'`

- [ ] **Step 3: Implement `ChildSwitcher`**

Create `apps/web/src/components/parent/ChildSwitcher.tsx`:

```tsx
import Link from "next/link";

export function ChildSwitcher({
  students,
  activeStudentId,
}: {
  students: { id: number; name: string }[];
  activeStudentId: number;
}) {
  if (students.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {students.map((child) => {
        const isActive = child.id === activeStudentId;
        return (
          <Link
            key={child.id}
            href={`/parent?studentId=${child.id}`}
            aria-current={isActive ? "true" : undefined}
            className={
              isActive
                ? "rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all"
                : "rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-500 transition-all hover:bg-neutral-50"
            }
          >
            {child.name}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/child-switcher.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/parent/ChildSwitcher.tsx apps/web/tests/child-switcher.test.tsx
git commit -m "Add parent child-switcher component"
```

---

### Task 6: Summary card components

**Files:**
- Create: `apps/web/src/components/parent/SummaryCards.tsx`
- Test: `apps/web/tests/summary-cards.test.tsx`

**Interfaces:**
- Consumes: `ParentOverview`, `ParentAssignmentEntry`, `ParentExamSubject` types from `apps/web/src/lib/parent/overview.ts` (Task 4).
- Produces: four exported components — `AttendanceCard({ percent: number })`, `AssignmentsCard({ assignments: ParentAssignmentEntry[] })`, `MarksCard({ latestExam: ParentOverview["latestExam"] })`, `FeesCard({ fees: ParentOverview["feesOutstanding"] })`. Consumed by `/parent/page.tsx` in Task 8.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/summary-cards.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  AttendanceCard,
  AssignmentsCard,
  MarksCard,
  FeesCard,
} from "../src/components/parent/SummaryCards";

describe("AttendanceCard", () => {
  afterEach(() => cleanup());

  it("shows the attendance percent", () => {
    render(<AttendanceCard percent={82} />);
    expect(screen.getByText("82%")).toBeInTheDocument();
  });
});

describe("AssignmentsCard", () => {
  afterEach(() => cleanup());

  it("shows a message when there are no pending assignments", () => {
    render(<AssignmentsCard assignments={[]} />);
    expect(screen.getByText("No pending assignments")).toBeInTheDocument();
  });

  it("lists each assignment with subject, title, and due date", () => {
    render(
      <AssignmentsCard
        assignments={[
          { id: 1, subject: "Mathematics", title: "Worksheet 3", dueDate: "2026-08-01", status: "pending" },
          { id: 2, subject: "Science", title: "Lab Report", dueDate: "2026-07-05", status: "overdue" },
        ]}
      />
    );
    expect(screen.getByText("Worksheet 3")).toBeInTheDocument();
    expect(screen.getByText("Lab Report")).toBeInTheDocument();
    expect(screen.getByText("2026-07-05 · overdue")).toBeInTheDocument();
  });
});

describe("MarksCard", () => {
  afterEach(() => cleanup());

  it("shows a message when there is no exam yet", () => {
    render(<MarksCard latestExam={null} />);
    expect(screen.getByText("No exams recorded yet")).toBeInTheDocument();
  });

  it("shows the latest exam's subject breakdown", () => {
    render(
      <MarksCard
        latestExam={{
          examName: "Final Term",
          term: "Term 2",
          subjects: [{ subject: "Mathematics", marksObtained: 91, maxMarks: 100, grade: "A" }],
        }}
      />
    );
    expect(screen.getByText("Final Term")).toBeInTheDocument();
    expect(screen.getByText("Mathematics: 91/100 (A)")).toBeInTheDocument();
  });
});

describe("FeesCard", () => {
  afterEach(() => cleanup());

  it("shows 'No dues' when the outstanding amount is zero", () => {
    render(<FeesCard fees={{ amount: 0, nearestDueDate: null }} />);
    expect(screen.getByText("No dues")).toBeInTheDocument();
  });

  it("shows the outstanding amount and nearest due date", () => {
    render(<FeesCard fees={{ amount: 3000, nearestDueDate: "2026-09-01" }} />);
    expect(screen.getByText("₹3000")).toBeInTheDocument();
    expect(screen.getByText("Due 2026-09-01")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/summary-cards.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/parent/SummaryCards'`

- [ ] **Step 3: Implement `SummaryCards`**

Create `apps/web/src/components/parent/SummaryCards.tsx`:

```tsx
import type { ParentAssignmentEntry, ParentOverview } from "@/lib/parent/overview";

const cardClass =
  "rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]";
const labelClass = "text-[11px] font-semibold text-neutral-400";
const titleClass = "mb-2 text-xs font-bold text-neutral-800";

export function AttendanceCard({ percent }: { percent: number }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Attendance</p>
      <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
        {percent}%
      </span>
      <span className={labelClass}>This month</span>
    </div>
  );
}

export function AssignmentsCard({ assignments }: { assignments: ParentAssignmentEntry[] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Assignments</p>
      {assignments.length === 0 ? (
        <p className={labelClass}>No pending assignments</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="text-xs">
              <p className="font-semibold text-neutral-800">{assignment.title}</p>
              <p className={assignment.status === "overdue" ? "text-red-600" : "text-neutral-400"}>
                {assignment.subject} · {assignment.dueDate} · {assignment.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MarksCard({ latestExam }: { latestExam: ParentOverview["latestExam"] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Marks</p>
      {latestExam === null ? (
        <p className={labelClass}>No exams recorded yet</p>
      ) : (
        <div>
          <p className="mb-1 text-xs font-semibold text-neutral-800">{latestExam.examName}</p>
          <ul className="space-y-1">
            {latestExam.subjects.map((subject) => (
              <li key={subject.subject} className={labelClass}>
                {subject.subject}: {subject.marksObtained}/{subject.maxMarks} ({subject.grade})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FeesCard({ fees }: { fees: ParentOverview["feesOutstanding"] }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>Fees</p>
      {fees.amount === 0 ? (
        <p className="text-sm font-bold text-emerald-600">No dues</p>
      ) : (
        <div>
          <span className="block text-2xl font-bold leading-none tracking-tight text-neutral-800">
            ₹{fees.amount}
          </span>
          {fees.nearestDueDate && (
            <span className="text-[11px] font-semibold text-amber-600">Due {fees.nearestDueDate}</span>
          )}
        </div>
      )}
    </div>
  );
}
```

Note: the assignment line text is `{assignment.subject} · {assignment.dueDate} · {assignment.status}`, matching the test's `"2026-07-05 · overdue"` substring check via `getByText` on the exact rendered string.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/summary-cards.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/parent/SummaryCards.tsx apps/web/tests/summary-cards.test.tsx
git commit -m "Add parent summary card components"
```

---

### Task 7: `/parent` layout

**Files:**
- Create: `apps/web/src/app/parent/layout.tsx`

**Interfaces:**
- Consumes: `requireParentRole` (Task 3), `prisma` from `apps/web/src/lib/prisma.ts`.
- Produces: default export `ParentLayout({ children }: { children: React.ReactNode })`, a Next.js layout mounted for every route under `/parent`.

This task has no isolated unit test — like the existing `src/app/dashboard/layout.tsx`, this file is a thin async server component composing already-tested pieces (`requireParentRole`, direct Prisma reads), and the codebase does not unit-test layout/page server components directly (only their extracted lib functions and client subcomponents are tested, per `dashboard/layout.tsx`'s absence from `tests/`). It will be exercised manually in Task 9's verification.

- [ ] **Step 1: Implement the layout**

Create `apps/web/src/app/parent/layout.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const claims = requireParentRole();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: claims.schoolId } });

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="flex items-center justify-between border-b border-neutral-200/50 bg-white px-6 py-4">
        <div>
          <p className="text-sm font-semibold tracking-tight text-neutral-900">{school.name}</p>
          <p className="text-[11px] font-medium text-neutral-400">Parent workspace</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6] text-xs font-bold text-white">
            {initials}
          </div>
          <span className="text-xs font-semibold text-neutral-800">{user.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-black"
            >
              Logout
            </button>
          </form>
        </div>
      </header>
      <main className="p-4 lg:p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the file**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `src/app/parent/layout.tsx`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/layout.tsx
git commit -m "Add parent workspace layout"
```

---

### Task 8: `/parent` page

**Files:**
- Create: `apps/web/src/app/parent/page.tsx`

**Interfaces:**
- Consumes: `requireParentRole` (Task 3), `getParentChildren`/`getParentOverview` (Task 4), `ChildSwitcher` (Task 5), `AttendanceCard`/`AssignmentsCard`/`MarksCard`/`FeesCard` (Task 6), `prisma`.
- Produces: default export `ParentPage({ searchParams }: { searchParams: { studentId?: string } })`. No new exports consumed elsewhere — this is the leaf of the feature.

This task has no isolated unit test, for the same reason as Task 7 (thin server-component composition of already-tested pieces). It is exercised manually in Task 9's verification, which is the point where every underlying piece (auth redirect, child resolution, overview data, card rendering) is proven to work together.

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/parent/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildren, getParentOverview } from "@/lib/parent/overview";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { AttendanceCard, AssignmentsCard, MarksCard, FeesCard } from "@/components/parent/SummaryCards";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: { studentId?: string };
}) {
  const claims = requireParentRole();
  const children = await getParentChildren(prisma, claims.userId);

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-16 text-center">
        <p className="text-sm font-bold text-neutral-800">No students linked to this account</p>
        <p className="mt-1 text-xs text-neutral-400">Contact the school office to link your child.</p>
      </div>
    );
  }

  const requestedId = searchParams.studentId ? Number(searchParams.studentId) : undefined;
  const activeChild =
    children.find((child) => child.id === requestedId) ?? children[0];

  const overview = await getParentOverview(prisma, {
    studentId: activeChild.id,
    schoolId: claims.schoolId,
  });

  return (
    <div className="space-y-4">
      <ChildSwitcher
        students={children.map((child) => ({ id: child.id, name: child.name }))}
        activeStudentId={activeChild.id}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AttendanceCard percent={overview.attendanceMonthPercent} />
        <AssignmentsCard assignments={overview.upcomingAssignments} />
        <MarksCard latestExam={overview.latestExam} />
        <FeesCard fees={overview.feesOutstanding} />
      </div>
    </div>
  );
}
```

This is the one place `studentId` is resolved from a raw URL param — note it is only used to `.find()` within `children`, which is already scoped to `claims.userId` via `getParentChildren`. A tampered `studentId` that doesn't belong to this parent simply falls through to `children[0]`, never reaching `getParentOverview` with an unauthorized id.

- [ ] **Step 2: Typecheck the file**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `src/app/parent/page.tsx`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/page.tsx
git commit -m "Add parent home page with child switcher and summary cards"
```

---

### Task 9: Full-suite verification and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `cd apps/web && npm test`
Expected: all tests pass, including every file touched/created in Tasks 1–6.

- [ ] **Step 2: Run the typechecker across the whole app**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually walk through the parent login flow**

Start the dev server (`cd apps/web && npm run dev`), then using a test DB seeded with `createSeedFixtures` (or the app's existing dev-seed process):
1. Go to `/login`, confirm the heading now reads "Log in".
2. Enter the seeded parent's phone (`+10000000004` from `prisma/fixtures.ts`), submit, read the OTP from server logs/console SMS sender, enter it.
3. Confirm the browser lands on `/parent` (not `/dashboard`).
4. Confirm the header shows the school name and parent's name/initials, and the four cards render with the seeded student's data.
5. Confirm clicking "Logout" clears the session and redirects to `/login`.
6. Manually visit `/dashboard` while logged in as the parent — confirm it redirects to `/login` (not an infinite loop).
7. Log in as a staff user (e.g. `+10000000001`, the seeded teacher) and confirm it still lands on `/dashboard` as before, and that visiting `/parent` as that staff session redirects to `/login`.

Expected: every step behaves as described above with no console errors.

- [ ] **Step 4: Report results**

If any step in Step 3 fails, fix the underlying task before proceeding — do not commit a workaround here. Once all steps pass, this plan is complete; no further commit is needed for this task.
