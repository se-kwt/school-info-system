# Admin: School Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Admin role the ability to create classes, staff accounts (with optional teacher-class assignment), and students (with parent linking/creation), on top of the already-merged Foundation and Web Dashboard Shell.

**Architecture:** New Next.js API routes (one per resource: classes, staff, students) follow the exact pattern already established by Foundation's auth routes — a thin route handler wrapping a testable business-logic function in `src/lib/`. Since these routes are called from the browser via the dashboard's cookie-based session (not a Bearer token), a new `requireApiRole` helper reads and verifies the session cookie the same way `requireDashboardRole` does for pages, but throws the existing `AuthError` (401/403) instead of redirecting, so routes can return a clean JSON error. Pages are Server Components that fetch lists directly via Prisma (matching the existing `/dashboard` home page pattern) plus a client-component form that `fetch`-posts and calls `router.refresh()`.

**Tech Stack:** Next.js 14 App Router, Prisma, Vitest + `@testing-library/react` (already installed from the Web Dashboard Shell plan).

## Global Constraints

- No database schema changes — `School`, `Class`, `User`, `Student`, `ParentStudent`, `ClassTeacher` all already exist.
- Every new route/page scopes reads and writes to `claims.schoolId` from the verified session — never a client-supplied school ID.
- All three create endpoints (`/api/classes`, `/api/staff`, `/api/students`) are admin-only (`requireApiRole(["admin"])`); the `/dashboard/students` page itself remains viewable by `teacher, admin` (unchanged from the Web Dashboard Shell plan), with the create form shown only to admins.
- Create + list only — no edit or delete endpoints/UI in this plan.
- Uniqueness conflicts return a specific `409` with a clear message — never a raw Prisma constraint error surfaced to the client.
- No Server Actions — plain API routes + client-side `fetch`, consistent with the login page and dashboard shell.

---

### Task 1: `requireApiRole` — cookie-based auth guard for API routes

**Files:**
- Create: `apps/web/src/lib/auth/require-api-role.ts`
- Test: `apps/web/tests/require-api-role.test.ts`

**Interfaces:**
- Consumes: `verifySessionCookie`, `SESSION_COOKIE_NAME` from `apps/web/src/lib/auth/session-cookie.ts`; `AuthError` from `apps/web/src/lib/auth/rbac.ts`; `SessionClaims` from `apps/web/src/lib/auth/jwt.ts`.
- Produces: `requireApiRole(allowedRoles: SessionClaims["role"][]): SessionClaims` — throws `AuthError` (401 for no/invalid session, 403 for disallowed role) rather than redirecting. Used by Task 3 (`/api/classes`), Task 5 (`/api/staff`), and Task 7 (`/api/students`).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/require-api-role.test.ts`:

```ts
import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach } from "vitest";
import { requireApiRole } from "../src/lib/auth/require-api-role";
import { AuthError } from "../src/lib/auth/rbac";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireApiRole", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
  });

  it("returns claims when the session cookie has an allowed role", () => {
    const token = signSessionToken({ userId: 1, role: "admin", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = requireApiRole(["admin"]);

    expect(claims.role).toBe("admin");
  });

  it("throws a 401 AuthError when there is no session cookie", () => {
    cookieStore.get.mockReturnValue(undefined);

    try {
      requireApiRole(["admin"]);
      throw new Error("expected requireApiRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
    }
  });

  it("throws a 403 AuthError when the role is not allowed", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    try {
      requireApiRole(["admin"]);
      throw new Error("expected requireApiRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(403);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/require-api-role.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/auth/require-api-role'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/auth/require-api-role.ts`:

```ts
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import { AuthError } from "./rbac";
import type { SessionClaims } from "./jwt";

export function requireApiRole(allowedRoles: SessionClaims["role"][]): SessionClaims {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims) {
    throw new AuthError(401, "Not authenticated");
  }

  if (!allowedRoles.includes(claims.role)) {
    throw new AuthError(403, "Role not permitted for this resource");
  }

  return claims;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/require-api-role.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/lib/auth/require-api-role.ts apps/web/tests/require-api-role.test.ts
git commit -m "Add requireApiRole cookie-based auth guard for API routes"
```

---

### Task 2: Add Classes and Staff to admin navigation

**Files:**
- Modify: `apps/web/src/lib/dashboard/nav-items.ts`
- Modify: `apps/web/tests/nav-items.test.ts`

**Interfaces:**
- Produces: `getNavItemsForRole("admin")` now includes `/dashboard/classes` and `/dashboard/staff`; `getNavItemsForRole` for `teacher`/`accountant`/`parent` is unchanged. No new exports — this modifies the existing function from the Web Dashboard Shell plan.

- [ ] **Step 1: Update the test to the new expected admin list (written first, will fail until the implementation changes)**

Replace the full contents of `apps/web/tests/nav-items.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getNavItemsForRole } from "../src/lib/dashboard/nav-items";

describe("getNavItemsForRole", () => {
  it("returns six items for teacher, excluding Classes, Staff, and Fees", () => {
    const items = getNavItemsForRole("teacher");
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/students",
      "/dashboard/attendance",
      "/dashboard/assignments",
      "/dashboard/marks",
      "/dashboard/timetable",
    ]);
  });

  it("returns all nine items for admin, including Classes and Staff", () => {
    const items = getNavItemsForRole("admin");
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/classes",
      "/dashboard/staff",
      "/dashboard/students",
      "/dashboard/attendance",
      "/dashboard/assignments",
      "/dashboard/marks",
      "/dashboard/timetable",
      "/dashboard/fees",
    ]);
  });

  it("returns only Dashboard and Fees for accountant", () => {
    const items = getNavItemsForRole("accountant");
    expect(items.map((item) => item.href)).toEqual(["/dashboard", "/dashboard/fees"]);
  });

  it("returns an empty list for parent", () => {
    expect(getNavItemsForRole("parent")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/nav-items.test.ts
```

Expected: FAIL — the admin test expects 9 items but the current implementation returns 7

- [ ] **Step 3: Update the implementation**

Replace the full contents of `apps/web/src/lib/dashboard/nav-items.ts`:

```ts
import type { SessionClaims } from "../auth/jwt";

export interface NavItem {
  href: string;
  label: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/classes", label: "Classes" },
  { href: "/dashboard/staff", label: "Staff" },
  { href: "/dashboard/students", label: "Students" },
  { href: "/dashboard/attendance", label: "Attendance" },
  { href: "/dashboard/assignments", label: "Assignments" },
  { href: "/dashboard/marks", label: "Exams & Marks" },
  { href: "/dashboard/timetable", label: "Timetable" },
  { href: "/dashboard/fees", label: "Fees" },
];

const NAV_HREFS_BY_ROLE: Record<SessionClaims["role"], string[]> = {
  teacher: [
    "/dashboard",
    "/dashboard/students",
    "/dashboard/attendance",
    "/dashboard/assignments",
    "/dashboard/marks",
    "/dashboard/timetable",
  ],
  admin: [
    "/dashboard",
    "/dashboard/classes",
    "/dashboard/staff",
    "/dashboard/students",
    "/dashboard/attendance",
    "/dashboard/assignments",
    "/dashboard/marks",
    "/dashboard/timetable",
    "/dashboard/fees",
  ],
  accountant: ["/dashboard", "/dashboard/fees"],
  parent: [],
};

export function getNavItemsForRole(role: SessionClaims["role"]): NavItem[] {
  const allowedHrefs = NAV_HREFS_BY_ROLE[role];
  return ALL_NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/nav-items.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/lib/dashboard/nav-items.ts apps/web/tests/nav-items.test.ts
git commit -m "Add Classes and Staff to admin navigation"
```

---

### Task 3: Classes API (list + create)

**Files:**
- Create: `apps/web/src/lib/school-setup/classes.ts`
- Create: `apps/web/src/app/api/classes/route.ts`
- Test: `apps/web/tests/classes-api.test.ts`

**Interfaces:**
- Consumes: `requireApiRole` (Task 1), `AuthError` from `apps/web/src/lib/auth/rbac.ts`, `prisma` from `apps/web/src/lib/prisma.ts`.
- Produces: `ClassSummary { id: number; name: string; section: string }`, `listClasses(prisma, schoolId): Promise<ClassSummary[]>`, `CreateClassResult = { ok: true; class: ClassSummary } | { ok: false; error: "DUPLICATE" }`, `createClass(prisma, schoolId, input: { name: string; section: string }): Promise<CreateClassResult>` — used by Task 4 (Classes page) and Task 5 (Staff page's class-assignment dropdown).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/classes-api.test.ts`:

```ts
import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getClasses, POST as postClasses } from "../src/app/api/classes/route";

describe("/api/classes", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15551110000", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a class and lists it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6", section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(201);
    const created = await postResponse.json();
    expect(created).toMatchObject({ name: "Grade 6", section: "B" });

    const getResponse = await getClasses();
    expect(getResponse.status).toBe(200);
    const list = await getResponse.json();
    expect(list).toEqual([{ id: created.id, name: "Grade 6", section: "B" }]);
  });

  it("rejects a duplicate name+section with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    await prisma.class.create({ data: { schoolId: school.id, name: "Grade 6", section: "B" } });

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6", section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a missing field with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const getResponse = await getClasses();
    expect(getResponse.status).toBe(401);
  });

  it("rejects a non-admin role with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15552220000", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const getResponse = await getClasses();
    expect(getResponse.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/classes-api.test.ts
```

Expected: FAIL with `Cannot find module '../src/app/api/classes/route'`

- [ ] **Step 3: Write the business-logic implementation**

`apps/web/src/lib/school-setup/classes.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export interface ClassSummary {
  id: number;
  name: string;
  section: string;
}

export async function listClasses(prisma: PrismaClient, schoolId: number): Promise<ClassSummary[]> {
  return prisma.class.findMany({
    where: { schoolId },
    select: { id: true, name: true, section: true },
    orderBy: [{ name: "asc" }, { section: "asc" }],
  });
}

export type CreateClassResult = { ok: true; class: ClassSummary } | { ok: false; error: "DUPLICATE" };

export async function createClass(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string; section: string }
): Promise<CreateClassResult> {
  const existing = await prisma.class.findFirst({
    where: { schoolId, name: input.name, section: input.section },
  });
  if (existing) {
    return { ok: false, error: "DUPLICATE" };
  }

  const created = await prisma.class.create({
    data: { schoolId, name: input.name, section: input.section },
    select: { id: true, name: true, section: true },
  });
  return { ok: true, class: created };
}
```

- [ ] **Step 4: Write the route**

`apps/web/src/app/api/classes/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listClasses, createClass } from "@/lib/school-setup/classes";

export async function GET() {
  try {
    const claims = requireApiRole(["admin"]);
    const classes = await listClasses(prisma, claims.schoolId);
    return NextResponse.json(classes);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let name: string | undefined;
    let section: string | undefined;
    try {
      ({ name, section } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !section) {
      return NextResponse.json({ error: "name and section are required" }, { status: 400 });
    }

    const result = await createClass(prisma, claims.schoolId, { name, section });
    if (!result.ok) {
      return NextResponse.json(
        { error: "A class with this name and section already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(result.class, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/classes-api.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/lib/school-setup/classes.ts apps/web/src/app/api/classes apps/web/tests/classes-api.test.ts
git commit -m "Add classes list/create API"
```

---

### Task 4: Classes page

**Files:**
- Create: `apps/web/src/app/dashboard/classes/page.tsx`
- Create: `apps/web/src/components/school-setup/CreateClassForm.tsx`

**Interfaces:**
- Consumes: `requireDashboardRole` from `apps/web/src/lib/auth/require-dashboard-role.ts` (Web Dashboard Shell), `listClasses` from `apps/web/src/lib/school-setup/classes.ts` (Task 3), `prisma` from `apps/web/src/lib/prisma.ts`.
- Produces: nothing consumed by later tasks in this plan (Task 5's Staff page also imports `listClasses` directly from Task 3, not from this page).

This task has no new automated tests, per the design spec's testing section: form screens are structurally simple and are verified manually in the browser (Step 3), consistent with how the Web Dashboard Shell plan treated its placeholder pages.

- [ ] **Step 1: Write the form component**

`apps/web/src/components/school-setup/CreateClassForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateClassForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, section }),
    });

    if (response.status === 201) {
      setName("");
      setSection("");
      router.refresh();
      return;
    }
    if (response.status === 409) {
      const body = await response.json();
      setError(body.error);
      return;
    }
    setError("Enter a name and section");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
      <input
        type="text"
        aria-label="Class name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="e.g. Grade 6"
      />
      <input
        type="text"
        aria-label="Section"
        value={section}
        onChange={(event) => setSection(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="e.g. B"
      />
      <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
        Create Class
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Write the page**

`apps/web/src/app/dashboard/classes/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { CreateClassForm } from "@/components/school-setup/CreateClassForm";

export default async function ClassesPage() {
  const claims = requireDashboardRole(["admin"]);
  const classes = await listClasses(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Classes</h1>
      <CreateClassForm />
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Section</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((klass) => (
            <tr key={klass.id}>
              <td className="border-b border-gray-100 py-2">{klass.name}</td>
              <td className="border-b border-gray-100 py-2">{klass.section}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all test files pass (unchanged in count from Task 3 — this task adds no new test file).

- [ ] **Step 4: Manually verify in a browser**

```bash
docker compose up -d
npm run dev
```

Log in as the seeded admin (phone `+10000000002`, per `prisma/fixtures.ts`), navigate to `/dashboard/classes`, create a class (e.g. name "Grade 9", section "C"), and confirm it appears in the table immediately without a full page reload. Submit the exact same name+section again and confirm the inline error "A class with this name and section already exists" appears.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/app/dashboard/classes apps/web/src/components/school-setup/CreateClassForm.tsx
git commit -m "Add Classes page with create form"
```

---

### Task 5: Staff API (list + create, with optional class assignment)

**Files:**
- Create: `apps/web/src/lib/school-setup/staff.ts`
- Create: `apps/web/src/app/api/staff/route.ts`
- Test: `apps/web/tests/staff-api.test.ts`

**Interfaces:**
- Consumes: `requireApiRole` (Task 1), `AuthError` from `apps/web/src/lib/auth/rbac.ts`, `prisma` from `apps/web/src/lib/prisma.ts`.
- Produces: `StaffSummary { id: number; name: string; phone: string; role: Role; classAssignment: { className: string; section: string; subject: string } | null }`, `listStaff(prisma, schoolId): Promise<StaffSummary[]>`, `CreateStaffResult = { ok: true; staff: { id: number; name: string; phone: string; role: Role } } | { ok: false; error: "DUPLICATE_PHONE" }`, `createStaff(prisma, schoolId, input: { name: string; phone: string; role: Role; classId?: number; subject?: string }): Promise<CreateStaffResult>` — used by Task 6 (Staff page).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/staff-api.test.ts`:

```ts
import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getStaff, POST as postStaff } from "../src/app/api/staff/route";

describe("/api/staff", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15551110001", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a non-teacher staff member and lists them", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({ name: "New Accountant", phone: "+15559990001", role: "accountant" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(201);

    const getResponse = await getStaff();
    const list = await getResponse.json();
    expect(list).toHaveLength(2);
    const accountant = list.find((entry: { role: string }) => entry.role === "accountant");
    expect(accountant).toMatchObject({
      name: "New Accountant",
      phone: "+15559990001",
      classAssignment: null,
    });
  });

  it("creates a teacher with a class assignment and reflects it in the list", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 7", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: "New Teacher",
        phone: "+15559990002",
        role: "teacher",
        classId: klass.id,
        subject: "Science",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(201);

    const classTeacherRow = await prisma.classTeacher.findFirst({
      where: { classId: klass.id, subject: "Science" },
    });
    expect(classTeacherRow).not.toBeNull();

    const getResponse = await getStaff();
    const list = await getResponse.json();
    const teacher = list.find((entry: { role: string }) => entry.role === "teacher");
    expect(teacher.classAssignment).toEqual({
      className: "Grade 7",
      section: "A",
      subject: "Science",
    });
  });

  it("rejects a duplicate phone with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    await prisma.user.create({
      data: { phone: "+15559990003", role: "teacher", name: "Existing Teacher", schoolId: school.id },
    });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({ name: "Duplicate", phone: "+15559990003", role: "teacher" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a teacher with a classId but no subject with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 8", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: "No Subject",
        phone: "+15559990004",
        role: "teacher",
        classId: klass.id,
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStaff(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects a non-admin role with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15559990005", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const getResponse = await getStaff();
    expect(getResponse.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/staff-api.test.ts
```

Expected: FAIL with `Cannot find module '../src/app/api/staff/route'`

- [ ] **Step 3: Write the business-logic implementation**

`apps/web/src/lib/school-setup/staff.ts`:

```ts
import type { PrismaClient, Role } from "@prisma/client";

export interface StaffSummary {
  id: number;
  name: string;
  phone: string;
  role: Role;
  classAssignment: { className: string; section: string; subject: string } | null;
}

export async function listStaff(prisma: PrismaClient, schoolId: number): Promise<StaffSummary[]> {
  const users = await prisma.user.findMany({
    where: { schoolId, role: { in: ["teacher", "admin", "accountant"] } },
    include: {
      classesTaught: {
        include: { class: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return users.map((user) => {
    const assignment = user.classesTaught[0];
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      classAssignment: assignment
        ? {
            className: assignment.class.name,
            section: assignment.class.section,
            subject: assignment.subject,
          }
        : null,
    };
  });
}

export type CreateStaffResult =
  | { ok: true; staff: { id: number; name: string; phone: string; role: Role } }
  | { ok: false; error: "DUPLICATE_PHONE" };

export async function createStaff(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string; phone: string; role: Role; classId?: number; subject?: string }
): Promise<CreateStaffResult> {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    return { ok: false, error: "DUPLICATE_PHONE" };
  }

  const staff = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { schoolId, name: input.name, phone: input.phone, role: input.role },
    });

    if (input.role === "teacher" && input.classId && input.subject) {
      await tx.classTeacher.create({
        data: { classId: input.classId, teacherUserId: created.id, subject: input.subject },
      });
    }

    return created;
  });

  return {
    ok: true,
    staff: { id: staff.id, name: staff.name, phone: staff.phone, role: staff.role },
  };
}
```

- [ ] **Step 4: Write the route**

`apps/web/src/app/api/staff/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listStaff, createStaff } from "@/lib/school-setup/staff";

const VALID_ROLES = ["teacher", "admin", "accountant"] as const;
type StaffRole = (typeof VALID_ROLES)[number];

function isValidRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (VALID_ROLES as readonly string[]).includes(value);
}

export async function GET() {
  try {
    const claims = requireApiRole(["admin"]);
    const staff = await listStaff(prisma, claims.schoolId);
    return NextResponse.json(staff);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let name: string | undefined;
    let phone: string | undefined;
    let role: unknown;
    let classId: number | undefined;
    let subject: string | undefined;
    try {
      ({ name, phone, role, classId, subject } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !phone || !isValidRole(role)) {
      return NextResponse.json({ error: "name, phone, and role are required" }, { status: 400 });
    }

    if (classId && !subject) {
      return NextResponse.json(
        { error: "subject is required when assigning a class" },
        { status: 400 }
      );
    }

    const result = await createStaff(prisma, claims.schoolId, {
      name,
      phone,
      role,
      classId,
      subject,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "This phone number is already registered" }, { status: 409 });
    }

    return NextResponse.json(result.staff, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/staff-api.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/lib/school-setup/staff.ts apps/web/src/app/api/staff apps/web/tests/staff-api.test.ts
git commit -m "Add staff list/create API with optional class assignment"
```

---

### Task 6: Staff page

**Files:**
- Create: `apps/web/src/app/dashboard/staff/page.tsx`
- Create: `apps/web/src/components/school-setup/CreateStaffForm.tsx`

**Interfaces:**
- Consumes: `requireDashboardRole` (Web Dashboard Shell), `listStaff` from `apps/web/src/lib/school-setup/staff.ts` (Task 5), `listClasses` from `apps/web/src/lib/school-setup/classes.ts` (Task 3), `prisma`.
- Produces: nothing consumed by later tasks.

This task has no new automated tests, matching Task 4's rationale — verified manually in the browser (Step 3).

- [ ] **Step 1: Write the form component**

`apps/web/src/components/school-setup/CreateStaffForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Role = "teacher" | "admin" | "accountant";

export function CreateStaffForm({
  classes,
}: {
  classes: { id: number; name: string; section: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        role,
        classId: role === "teacher" && classId ? Number(classId) : undefined,
        subject: role === "teacher" && subject ? subject : undefined,
      }),
    });

    if (response.status === 201) {
      setName("");
      setPhone("");
      setClassId("");
      setSubject("");
      router.refresh();
      return;
    }
    if (response.status === 409) {
      const body = await response.json();
      setError(body.error);
      return;
    }
    setError("Check the required fields");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <input
        type="text"
        aria-label="Staff name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Name"
      />
      <input
        type="tel"
        aria-label="Staff phone"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Phone number"
      />
      <select
        aria-label="Role"
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
        className="rounded border border-gray-300 px-3 py-2"
      >
        <option value="teacher">Teacher</option>
        <option value="admin">Admin</option>
        <option value="accountant">Accountant</option>
      </select>
      {role === "teacher" && (
        <>
          <select
            aria-label="Assign class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">No class assignment</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name} {klass.section}
              </option>
            ))}
          </select>
          <input
            type="text"
            aria-label="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Subject (required if assigning a class)"
          />
        </>
      )}
      <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
        Create Staff
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Write the page**

`apps/web/src/app/dashboard/staff/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStaff } from "@/lib/school-setup/staff";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { CreateStaffForm } from "@/components/school-setup/CreateStaffForm";

export default async function StaffPage() {
  const claims = requireDashboardRole(["admin"]);
  const [staff, classes] = await Promise.all([
    listStaff(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Staff</h1>
      <CreateStaffForm classes={classes} />
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Phone</th>
            <th className="border-b border-gray-200 pb-2">Role</th>
            <th className="border-b border-gray-200 pb-2">Class Assignment</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id}>
              <td className="border-b border-gray-100 py-2">{member.name}</td>
              <td className="border-b border-gray-100 py-2">{member.phone}</td>
              <td className="border-b border-gray-100 py-2">{member.role}</td>
              <td className="border-b border-gray-100 py-2">
                {member.classAssignment
                  ? `${member.classAssignment.className} ${member.classAssignment.section} (${member.classAssignment.subject})`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all test files pass (unchanged in count from Task 5 — this task adds no new test file).

- [ ] **Step 4: Manually verify in a browser**

```bash
docker compose up -d
npm run dev
```

Log in as the seeded admin (phone `+10000000002`), navigate to `/dashboard/staff`, create a non-teacher (e.g. an Accountant) and confirm the class/subject fields are hidden and the row appears with "—" under Class Assignment. Then create a Teacher, select a class, and enter a subject; confirm the new row shows the assignment (e.g. "Grade 5 A (Mathematics)"). Submit a duplicate phone number and confirm the inline error "This phone number is already registered" appears.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/app/dashboard/staff apps/web/src/components/school-setup/CreateStaffForm.tsx
git commit -m "Add Staff page with create form"
```

---

### Task 7: Students API (list + create, with parent link/creation)

**Files:**
- Create: `apps/web/src/lib/school-setup/students.ts`
- Create: `apps/web/src/app/api/students/route.ts`
- Test: `apps/web/tests/students-api.test.ts`

**Interfaces:**
- Consumes: `requireApiRole` (Task 1), `AuthError` from `apps/web/src/lib/auth/rbac.ts`, `prisma`.
- Produces: `StudentSummary { id: number; name: string; admissionNo: string; class: { name: string; section: string }; parents: { name: string; phone: string }[] }`, `listStudents(prisma, schoolId): Promise<StudentSummary[]>`, `CreateStudentResult = { ok: true; student: { id: number; name: string; admissionNo: string } } | { ok: false; error: "DUPLICATE_ADMISSION_NO" } | { ok: false; error: "PHONE_WRONG_ROLE" } | { ok: false; error: "PARENT_NAME_REQUIRED" }`, `createStudent(prisma, schoolId, input: { name: string; dob: string; classId: number; admissionNo: string; parentPhone: string; parentName?: string }): Promise<CreateStudentResult>` — used by Task 8 (Students page).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/students-api.test.ts`:

```ts
import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getStudents, POST as postStudents } from "../src/app/api/students/route";

describe("/api/students", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15551110002", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a student linked to an existing parent", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 3", section: "A" },
    });
    const parent = await prisma.user.create({
      data: { phone: "+15558880001", role: "parent", name: "Existing Parent", schoolId: school.id },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "New Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-001",
        parentPhone: parent.phone,
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);

    const link = await prisma.parentStudent.findFirst({ where: { parentUserId: parent.id } });
    expect(link).not.toBeNull();
  });

  it("creates a student and a new parent in one request", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 4", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Another Student",
        dob: "2015-06-15",
        classId: klass.id,
        admissionNo: "SCH-002",
        parentPhone: "+15558880002",
        parentName: "Brand New Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);

    const newParent = await prisma.user.findUnique({ where: { phone: "+15558880002" } });
    expect(newParent).toMatchObject({ name: "Brand New Parent", role: "parent" });

    const getResponse = await getStudents();
    const list = await getResponse.json();
    const created = list.find((entry: { admissionNo: string }) => entry.admissionNo === "SCH-002");
    expect(created.parents).toEqual([{ name: "Brand New Parent", phone: "+15558880002" }]);
  });

  it("rejects a duplicate admission number with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Existing Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: klass.section,
        admissionNo: "SCH-003",
      },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Duplicate",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-003",
        parentPhone: "+15558880003",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a parentPhone belonging to a non-parent role with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 6", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15558880004", role: "teacher", name: "A Teacher", schoolId: school.id },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Blocked Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-004",
        parentPhone: teacher.phone,
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a new parentPhone with no parentName with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 7", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "No Parent Name",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-005",
        parentPhone: "+15558880005",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/students-api.test.ts
```

Expected: FAIL with `Cannot find module '../src/app/api/students/route'`

- [ ] **Step 3: Write the business-logic implementation**

`apps/web/src/lib/school-setup/students.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  class: { name: string; section: string };
  parents: { name: string; phone: string }[];
}

export async function listStudents(prisma: PrismaClient, schoolId: number): Promise<StudentSummary[]> {
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      class: true,
      parentLinks: { include: { parent: true } },
    },
    orderBy: { name: "asc" },
  });

  return students.map((student) => ({
    id: student.id,
    name: student.name,
    admissionNo: student.admissionNo,
    class: { name: student.class.name, section: student.class.section },
    parents: student.parentLinks.map((link) => ({
      name: link.parent.name,
      phone: link.parent.phone,
    })),
  }));
}

export type CreateStudentResult =
  | { ok: true; student: { id: number; name: string; admissionNo: string } }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PARENT_NAME_REQUIRED" };

export async function createStudent(
  prisma: PrismaClient,
  schoolId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    parentPhone: string;
    parentName?: string;
  }
): Promise<CreateStudentResult> {
  const existingAdmission = await prisma.student.findUnique({
    where: { admissionNo: input.admissionNo },
  });
  if (existingAdmission) {
    return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
  }

  const existingParent = await prisma.user.findUnique({ where: { phone: input.parentPhone } });
  if (existingParent && existingParent.role !== "parent") {
    return { ok: false, error: "PHONE_WRONG_ROLE" };
  }
  if (!existingParent && !input.parentName) {
    return { ok: false, error: "PARENT_NAME_REQUIRED" };
  }

  const targetClass = await prisma.class.findUniqueOrThrow({ where: { id: input.classId } });

  const student = await prisma.$transaction(async (tx) => {
    const parent =
      existingParent ??
      (await tx.user.create({
        data: { schoolId, phone: input.parentPhone, name: input.parentName as string, role: "parent" },
      }));

    const createdStudent = await tx.student.create({
      data: {
        schoolId,
        name: input.name,
        dob: new Date(input.dob),
        classId: input.classId,
        section: targetClass.section,
        admissionNo: input.admissionNo,
      },
    });

    await tx.parentStudent.create({
      data: { parentUserId: parent.id, studentId: createdStudent.id },
    });

    return createdStudent;
  });

  return {
    ok: true,
    student: { id: student.id, name: student.name, admissionNo: student.admissionNo },
  };
}
```

- [ ] **Step 4: Write the route**

`apps/web/src/app/api/students/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listStudents, createStudent } from "@/lib/school-setup/students";

export async function GET() {
  try {
    const claims = requireApiRole(["admin"]);
    const students = await listStudents(prisma, claims.schoolId);
    return NextResponse.json(students);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let name: string | undefined;
    let dob: string | undefined;
    let classId: number | undefined;
    let admissionNo: string | undefined;
    let parentPhone: string | undefined;
    let parentName: string | undefined;
    try {
      ({ name, dob, classId, admissionNo, parentPhone, parentName } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !dob || !classId || !admissionNo || !parentPhone) {
      return NextResponse.json(
        { error: "name, dob, classId, admissionNo, and parentPhone are required" },
        { status: 400 }
      );
    }

    const result = await createStudent(prisma, claims.schoolId, {
      name,
      dob,
      classId,
      admissionNo,
      parentPhone,
      parentName,
    });

    if (!result.ok) {
      if (result.error === "DUPLICATE_ADMISSION_NO") {
        return NextResponse.json(
          { error: "A student with this admission number already exists" },
          { status: 409 }
        );
      }
      if (result.error === "PHONE_WRONG_ROLE") {
        return NextResponse.json(
          { error: "This phone number is already registered as a different role" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "parentName is required to create a new parent account" },
        { status: 400 }
      );
    }

    return NextResponse.json(result.student, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/students-api.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/lib/school-setup/students.ts apps/web/src/app/api/students apps/web/tests/students-api.test.ts
git commit -m "Add students list/create API with parent linking"
```

---

### Task 8: Students page (replaces placeholder)

**Files:**
- Modify: `apps/web/src/app/dashboard/students/page.tsx` (replaces the Web Dashboard Shell placeholder)
- Create: `apps/web/src/components/school-setup/CreateStudentForm.tsx`

**Interfaces:**
- Consumes: `requireDashboardRole` (Web Dashboard Shell), `listStudents` from `apps/web/src/lib/school-setup/students.ts` (Task 7), `listClasses` from `apps/web/src/lib/school-setup/classes.ts` (Task 3), `prisma`.
- Produces: nothing consumed by later tasks — this is the final task in this plan.

This task has no new automated tests, matching Tasks 4 and 6's rationale — verified manually in the browser (Step 3).

- [ ] **Step 1: Write the form component**

`apps/web/src/components/school-setup/CreateStudentForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateStudentForm({
  classes,
}: {
  classes: { id: number; name: string; section: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [admissionNo, setAdmissionNo] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        dob,
        classId: classId ? Number(classId) : undefined,
        admissionNo,
        parentPhone,
        parentName: parentName || undefined,
      }),
    });

    if (response.status === 201) {
      setName("");
      setDob("");
      setAdmissionNo("");
      setParentPhone("");
      setParentName("");
      router.refresh();
      return;
    }
    if (response.status === 409 || response.status === 400) {
      const body = await response.json();
      setError(body.error);
      return;
    }
    setError("Check the required fields");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <input
        type="text"
        aria-label="Student name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Student name"
      />
      <input
        type="date"
        aria-label="Date of birth"
        value={dob}
        onChange={(event) => setDob(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
      />
      <select
        aria-label="Class"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
      >
        {classes.map((klass) => (
          <option key={klass.id} value={klass.id}>
            {klass.name} {klass.section}
          </option>
        ))}
      </select>
      <input
        type="text"
        aria-label="Admission number"
        value={admissionNo}
        onChange={(event) => setAdmissionNo(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Admission number"
      />
      <input
        type="tel"
        aria-label="Parent phone"
        value={parentPhone}
        onChange={(event) => setParentPhone(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Parent phone number"
      />
      <input
        type="text"
        aria-label="Parent name"
        value={parentName}
        onChange={(event) => setParentName(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Parent name (only if this phone is new)"
      />
      <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
        Create Student
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Replace the placeholder page**

Replace the full contents of `apps/web/src/app/dashboard/students/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStudents } from "@/lib/school-setup/students";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { CreateStudentForm } from "@/components/school-setup/CreateStudentForm";

export default async function StudentsPage() {
  const claims = requireDashboardRole(["teacher", "admin"]);
  const isAdmin = claims.role === "admin";
  const [students, classes] = await Promise.all([
    listStudents(prisma, claims.schoolId),
    isAdmin ? listClasses(prisma, claims.schoolId) : Promise.resolve([]),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Students</h1>
      {isAdmin && <CreateStudentForm classes={classes} />}
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Admission No.</th>
            <th className="border-b border-gray-200 pb-2">Class</th>
            <th className="border-b border-gray-200 pb-2">Parent(s)</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td className="border-b border-gray-100 py-2">{student.name}</td>
              <td className="border-b border-gray-100 py-2">{student.admissionNo}</td>
              <td className="border-b border-gray-100 py-2">
                {student.class.name} {student.class.section}
              </td>
              <td className="border-b border-gray-100 py-2">
                {student.parents.map((parent) => `${parent.name} (${parent.phone})`).join(", ") ||
                  "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Note: this page's own allowed roles (`["teacher", "admin"]`) are unchanged from the Web Dashboard Shell plan — a teacher can still view the student list, but only an admin sees the create form. The underlying `/api/students` `POST` route (Task 7) independently enforces `admin`-only regardless of what this page renders.

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all test files pass (unchanged in count from Task 7 — this task adds no new test file).

- [ ] **Step 4: Manually verify in a browser**

```bash
docker compose up -d
npm run dev
```

Log in as the seeded admin (phone `+10000000002`), navigate to `/dashboard/students`, and:
1. Create a student using the already-seeded parent's phone (`+10000000004`, per `prisma/fixtures.ts`) and confirm the new row shows that parent's name/phone without a "Parent name" field being required.
2. Create a second student using a brand-new phone number plus a parent name, and confirm a new parent row appears correctly linked.
3. Submit a duplicate admission number and confirm the inline error appears.

Then log out and log back in as the seeded teacher (phone `+10000000001`) and confirm `/dashboard/students` shows the list but no create form.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/app/dashboard/students/page.tsx apps/web/src/components/school-setup/CreateStudentForm.tsx
git commit -m "Replace Students placeholder with real list and create form"
```

---

## Definition of Done

- `requireApiRole` correctly gates all three new API routes (401 unauthenticated, 403 wrong role).
- `/dashboard/classes`: admin can create a class and see it listed; duplicate name+section is rejected with a clear message.
- `/dashboard/staff`: admin can create a Teacher/Admin/Accountant; creating a Teacher with a class+subject creates the `ClassTeacher` link in the same request; duplicate phone is rejected with a clear message.
- `/dashboard/students`: admin can create a student linked to an existing parent, or create a new parent in the same request; duplicate admission number and phone-belongs-to-wrong-role are both rejected with clear messages; teachers can still view the list but not create.
- The admin sidebar shows Classes and Staff (new); teacher/accountant/parent navigation is unchanged.
- `npx vitest run` passes end-to-end with zero manual setup beyond `docker compose up -d`.
