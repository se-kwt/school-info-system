# Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers post assignments for a class, edit their own assignments, and track per-student submission status; let both teachers and admins view a class's assignments and submission rosters.

**Architecture:** A business-logic module (`src/lib/assignments.ts`) with testable functions wrapped by thin API routes (`requireApiRole`-guarded), following the exact pattern already established by `src/lib/attendance.ts` and `src/app/api/attendance/route.ts`. A single Server Component page (`/dashboard/assignments`) with role-conditional client components, matching `src/app/dashboard/attendance/page.tsx` and `AttendanceView.tsx`.

**Tech Stack:** Next.js 14 (App Router route handlers), Prisma (PostgreSQL), Vitest + `vi.hoisted` cookie mocking for API tests, React client components with Tailwind.

## Global Constraints

- No Prisma schema changes — `Assignment` and `AssignmentStatus` models already exist (see `apps/web/prisma/schema.prisma:129-152`).
- Every read/write scoped by ownership: teacher via `ClassTeacher`, admin via `schoolId` — same as Attendance and Admin School Setup.
- Edit is restricted to `createdById === claims.userId` (not any assigned teacher) — an assignment has a single author.
- "Overdue" is never written to the database. It is computed at read time: stored `status: "pending"` + `dueDate` in the past → returned as `"overdue"`. Only `"pending"` / `"submitted"` are ever accepted as write input.
- All bulk writes (`createAssignment`'s per-student rows, `updateAssignmentStatuses`) happen inside a single `$transaction`.
- Nav item for `/dashboard/assignments` already exists in `src/lib/dashboard/nav-items.ts:14,25,35` for both teacher and admin — no nav changes needed.
- Follow existing error-response conventions exactly: `400` for bad/missing input or invalid FK, `403` for role/ownership rejection, `404` for a nonexistent resource id, `200` on success — no raw Prisma errors surfaced to the client.

---

### Task 1: List and create assignments

**Files:**
- Create: `apps/web/src/lib/assignments.ts`
- Create: `apps/web/src/app/api/assignments/route.ts`
- Create: `apps/web/tests/assignments-api.test.ts`

**Interfaces:**
- Consumes: `requireApiRole` from `src/lib/auth/require-api-role.ts` (`requireApiRole(allowedRoles: SessionClaims["role"][]): SessionClaims`, throws `AuthError` on failure); `AuthError` from `src/lib/auth/rbac.ts` (has `.status: number` and `.message: string`); `prisma` singleton from `src/lib/prisma.ts`; `SessionClaims` type from `src/lib/auth/jwt.ts` (`{ userId: number; role: "parent"|"teacher"|"admin"|"accountant"; schoolId: number }`).
- Produces: `AssignmentSummary` interface, `ListAssignmentsResult`/`CreateAssignmentResult` types, `listAssignments()`, `createAssignment()`, and the internal `displayStatus()`/`isOverdue()` helpers — all consumed by Task 2 and Task 3's lib functions and by the frontend in Tasks 4-5.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/assignments-api.test.ts`:

```typescript
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
import { GET as getAssignments, POST as postAssignments } from "../src/app/api/assignments/route";

describe("/api/assignments", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedSchoolWithClassAndTeacher() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550001111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math" },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Test Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-500",
      },
    });
    return { school, klass, teacher, student };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates an assignment and a pending status row for every student in the class", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBeTypeOf("number");

    const statuses = await prisma.assignmentStatus.findMany({ where: { assignmentId: body.id } });
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({ studentId: student.id, status: "pending" });
  });

  it("rejects a missing required field with 400", async () => {
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, subject: "Math", dueDate: "2026-07-10" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher creating for a class they don't teach with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550002222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(403);
  });

  it("rejects an admin attempting to POST with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550003333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: "2026-07-10",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAssignments(request);
    expect(response.status).toBe(403);
  });

  it("lists assignments for a class the teacher teaches, with submission counts", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Second Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-501",
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: new Date("2026-08-01"),
        createdById: teacher.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "submitted" },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: otherStudent.id, status: "pending" },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${klass.id}`);
    const response = await getAssignments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0]).toMatchObject({
      id: assignment.id,
      subject: "Math",
      title: "Chapter 3 worksheet",
      submittedCount: 1,
      totalCount: 2,
      hasOverdue: false,
    });
  });

  it("flags hasOverdue when a pending status has a past due date", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Overdue worksheet",
        dueDate: new Date("2020-01-01"),
        createdById: teacher.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "pending" },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${klass.id}`);
    const response = await getAssignments(request);
    const body = await response.json();
    expect(body.assignments[0].hasOverdue).toBe(true);
  });

  it("rejects a teacher listing a class they don't teach with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550004444", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${klass.id}`);
    const response = await getAssignments(request);
    expect(response.status).toBe(403);
  });

  it("allows admin to list any class in their school", async () => {
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: new Date("2026-08-01"),
        createdById: teacher.id,
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550005555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${klass.id}`);
    const response = await getAssignments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assignments).toHaveLength(1);
  });

  it("rejects a classId from a different school with 400", async () => {
    const { school } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550006666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments?classId=${otherClass.id}`);
    const response = await getAssignments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing classId with 400", async () => {
    const { school, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments");
    const response = await getAssignments(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npm test -- assignments-api`
Expected: FAIL — `Cannot find module '../src/lib/assignments'` / `'../src/app/api/assignments/route'`

- [ ] **Step 3: Write `src/lib/assignments.ts`**

```typescript
import type { PrismaClient, AssignmentStatusValue } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";

function isOverdue(dueDate: Date): boolean {
  const todayStart = new Date(new Date().toISOString().slice(0, 10));
  return dueDate < todayStart;
}

function displayStatus(
  status: AssignmentStatusValue,
  dueDate: Date
): "pending" | "submitted" | "overdue" {
  if (status === "pending" && isOverdue(dueDate)) {
    return "overdue";
  }
  return status;
}

export interface AssignmentSummary {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdById: number;
  submittedCount: number;
  totalCount: number;
  hasOverdue: boolean;
}

export type ListAssignmentsResult =
  | { ok: true; assignments: AssignmentSummary[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function listAssignments(
  prisma: PrismaClient,
  params: {
    classId: number;
    schoolId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<ListAssignmentsResult> {
  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: { classId: params.classId, teacherUserId: params.userId },
    });
    if (!link) {
      return { ok: false, error: "NOT_ASSIGNED" };
    }
  } else {
    const klass = await prisma.class.findFirst({
      where: { id: params.classId, schoolId: params.schoolId },
    });
    if (!klass) {
      return { ok: false, error: "INVALID_CLASS" };
    }
  }

  const assignments = await prisma.assignment.findMany({
    where: { classId: params.classId },
    include: { statuses: true },
    orderBy: { dueDate: "desc" },
  });

  const result: AssignmentSummary[] = assignments.map((assignment) => {
    const submittedCount = assignment.statuses.filter((s) => s.status === "submitted").length;
    const hasOverdue = assignment.statuses.some(
      (s) => s.status === "pending" && isOverdue(assignment.dueDate)
    );
    return {
      id: assignment.id,
      subject: assignment.subject,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate.toISOString().slice(0, 10),
      createdById: assignment.createdById,
      submittedCount,
      totalCount: assignment.statuses.length,
      hasOverdue,
    };
  });

  return { ok: true, assignments: result };
}

export type CreateAssignmentResult = { ok: true; id: number } | { ok: false; error: "NOT_ASSIGNED" };

export async function createAssignment(
  prisma: PrismaClient,
  params: {
    classId: number;
    teacherUserId: number;
    subject: string;
    title: string;
    description?: string;
    dueDate: string;
  }
): Promise<CreateAssignmentResult> {
  const link = await prisma.classTeacher.findFirst({
    where: { classId: params.classId, teacherUserId: params.teacherUserId },
  });
  if (!link) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const students = await prisma.student.findMany({
    where: { classId: params.classId },
    select: { id: true },
  });

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: {
        classId: params.classId,
        subject: params.subject,
        title: params.title,
        description: params.description ?? null,
        dueDate: new Date(params.dueDate),
        createdById: params.teacherUserId,
      },
    });
    if (students.length > 0) {
      await tx.assignmentStatus.createMany({
        data: students.map((student) => ({
          assignmentId: created.id,
          studentId: student.id,
          status: "pending" as const,
        })),
      });
    }
    return created;
  });

  return { ok: true, id: assignment.id };
}

export { displayStatus, isOverdue };
```

- [ ] **Step 4: Write `src/app/api/assignments/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listAssignments, createAssignment } from "@/lib/assignments";

export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);

    const { searchParams } = new URL(request.url);
    const classIdParam = searchParams.get("classId");
    if (!classIdParam) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }
    const classId = Number(classIdParam);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const result = await listAssignments(prisma, {
      classId,
      schoolId: claims.schoolId,
      role: claims.role,
      userId: claims.userId,
    });

    if (!result.ok) {
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
    }

    return NextResponse.json({ assignments: result.assignments });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["teacher"]);

    let classId: number | undefined;
    let subject: string | undefined;
    let title: string | undefined;
    let description: string | undefined;
    let dueDate: string | undefined;
    try {
      ({ classId, subject, title, description, dueDate } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || !subject || !title || !dueDate) {
      return NextResponse.json(
        { error: "classId, subject, title, and dueDate are required" },
        { status: 400 }
      );
    }

    const result = await createAssignment(prisma, {
      classId,
      teacherUserId: claims.userId,
      subject,
      title,
      description,
      dueDate,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
    }

    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npm test -- assignments-api`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/assignments.ts apps/web/src/app/api/assignments/route.ts apps/web/tests/assignments-api.test.ts
git commit -m "Add assignment list/create API"
```

---

### Task 2: Edit an assignment

**Files:**
- Modify: `apps/web/src/lib/assignments.ts`
- Create: `apps/web/src/app/api/assignments/[id]/route.ts`
- Modify: `apps/web/tests/assignments-api.test.ts`

**Interfaces:**
- Consumes: everything from Task 1 (`listAssignments`, `createAssignment`, `displayStatus`, `isOverdue` — `editAssignment` is added alongside them in the same file).
- Produces: `EditAssignmentResult` type, `editAssignment()` — used by the frontend edit form in Task 5.

- [ ] **Step 1: Add the failing tests**

Append to `apps/web/tests/assignments-api.test.ts`, inside the existing `describe("/api/assignments", ...)` block is fine, but since this is a different route module, add a new top-level `describe` block right after the closing `});` of the first one:

```typescript
import { PATCH as patchAssignment } from "../src/app/api/assignments/[id]/route";

describe("/api/assignments/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedAssignment() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550011111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math" },
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: new Date("2026-08-01"),
        createdById: teacher.id,
      },
    });
    return { school, klass, teacher, assignment };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("lets the creator edit title, subject, description, and due date", async () => {
    const { school, teacher, assignment } = await seedAssignment();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Chapter 3 worksheet (revised)", dueDate: "2026-08-05" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.assignment.findUnique({ where: { id: assignment.id } });
    expect(updated?.title).toBe("Chapter 3 worksheet (revised)");
    expect(updated?.dueDate.toISOString().slice(0, 10)).toBe("2026-08-05");
  });

  it("rejects a different teacher assigned to the same class with 403", async () => {
    const { school, klass, assignment } = await seedAssignment();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550012222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: otherTeacher.id, subject: "Science" },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Hijacked title" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a nonexistent or cross-school assignment id", async () => {
    const { school, teacher } = await seedAssignment();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments/999999", {
      method: "PATCH",
      body: JSON.stringify({ title: "Doesn't matter" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: { id: "999999" } });
    expect(response.status).toBe(404);
  });

  it("rejects an empty body with 400", async () => {
    const { school, teacher, assignment } = await seedAssignment();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(400);
  });

  it("rejects an admin attempting to PATCH with 403", async () => {
    const { school, assignment } = await seedAssignment();
    const admin = await prisma.user.create({
      data: { phone: "+15550013333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Doesn't matter" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchAssignment(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npm test -- assignments-api`
Expected: FAIL — `Cannot find module '../src/app/api/assignments/[id]/route'`

- [ ] **Step 3: Add `editAssignment` to `src/lib/assignments.ts`**

Add below `createAssignment`, before the final `export { displayStatus, isOverdue };` line:

```typescript
export type EditAssignmentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "FORBIDDEN" };

export async function editAssignment(
  prisma: PrismaClient,
  params: {
    assignmentId: number;
    teacherUserId: number;
    schoolId: number;
    fields: {
      subject?: string;
      title?: string;
      description?: string;
      dueDate?: string;
    };
  }
): Promise<EditAssignmentResult> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { class: true },
  });
  if (!assignment || assignment.class.schoolId !== params.schoolId) {
    return { ok: false, error: "NOT_FOUND" };
  }
  if (assignment.createdById !== params.teacherUserId) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const data: {
    subject?: string;
    title?: string;
    description?: string;
    dueDate?: Date;
  } = {};
  if (params.fields.subject !== undefined) data.subject = params.fields.subject;
  if (params.fields.title !== undefined) data.title = params.fields.title;
  if (params.fields.description !== undefined) data.description = params.fields.description;
  if (params.fields.dueDate !== undefined) data.dueDate = new Date(params.fields.dueDate);

  await prisma.assignment.update({ where: { id: params.assignmentId }, data });
  return { ok: true };
}
```

- [ ] **Step 4: Write `src/app/api/assignments/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { editAssignment } from "@/lib/assignments";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["teacher"]);

    const assignmentId = Number(params.id);
    if (Number.isNaN(assignmentId)) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    let body: { subject?: string; title?: string; description?: string; dueDate?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (
      body.subject === undefined &&
      body.title === undefined &&
      body.description === undefined &&
      body.dueDate === undefined
    ) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const result = await editAssignment(prisma, {
      assignmentId,
      teacherUserId: claims.userId,
      schoolId: claims.schoolId,
      fields: body,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Only the teacher who created this assignment can edit it" },
        { status: 403 }
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npm test -- assignments-api`
Expected: PASS (14 tests total)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/assignments.ts apps/web/src/app/api/assignments/[id]/route.ts apps/web/tests/assignments-api.test.ts
git commit -m "Add assignment edit API, restricted to the original creator"
```

---

### Task 3: Per-student submission status roster

**Files:**
- Modify: `apps/web/src/lib/assignments.ts`
- Create: `apps/web/src/app/api/assignments/[id]/statuses/route.ts`
- Modify: `apps/web/tests/assignments-api.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-2 in `src/lib/assignments.ts`, particularly `displayStatus()` and `isOverdue()`.
- Produces: `StatusEntry` interface, `GetStatusesResult`/`UpdateStatusesResult` types, `getAssignmentStatuses()`, `updateAssignmentStatuses()` — used by the frontend roster component in Task 5.

- [ ] **Step 1: Add the failing tests**

Append a new `describe` block to `apps/web/tests/assignments-api.test.ts`, after the `/api/assignments/[id]` block, with the additional import at the top of the file alongside the other route imports:

```typescript
import {
  GET as getStatuses,
  POST as postStatuses,
} from "../src/app/api/assignments/[id]/statuses/route";
```

```typescript
describe("/api/assignments/[id]/statuses", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedAssignmentWithStudents() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550021111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math" },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Test Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-600",
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Chapter 3 worksheet",
        dueDate: new Date("2026-08-01"),
        createdById: teacher.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "pending" },
    });
    return { school, klass, teacher, student, assignment };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("returns the roster with computed status", async () => {
    const { school, teacher, student, assignment } = await seedAssignmentWithStudents();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`);
    const response = await getStatuses(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.statuses).toEqual([
      { studentId: student.id, name: "Test Student", status: "pending" },
    ]);
  });

  it("computes overdue for a past-due pending row", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550022222", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math" },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Test Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-601",
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        classId: klass.id,
        subject: "Math",
        title: "Overdue worksheet",
        dueDate: new Date("2020-01-01"),
        createdById: teacher.id,
      },
    });
    await prisma.assignmentStatus.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "pending" },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`);
    const response = await getStatuses(request, { params: { id: String(assignment.id) } });
    const body = await response.json();
    expect(body.statuses[0].status).toBe("overdue");
  });

  it("returns 404 for a nonexistent assignment id", async () => {
    const { school, teacher } = await seedAssignmentWithStudents();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/assignments/999999/statuses");
    const response = await getStatuses(request, { params: { id: "999999" } });
    expect(response.status).toBe(404);
  });

  it("rejects a teacher not assigned to the class with 403", async () => {
    const { school, assignment } = await seedAssignmentWithStudents();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550023333", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`);
    const response = await getStatuses(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(403);
  });

  it("allows admin to view the roster", async () => {
    const { school, student, assignment } = await seedAssignmentWithStudents();
    const admin = await prisma.user.create({
      data: { phone: "+15550024444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`);
    const response = await getStatuses(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.statuses[0].studentId).toBe(student.id);
  });

  it("updates statuses without duplicating rows on re-save", async () => {
    const { school, teacher, student, assignment } = await seedAssignmentWithStudents();
    loginAs(teacher.id, "teacher", school.id);

    async function save(status: string) {
      const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
        method: "POST",
        body: JSON.stringify({ entries: [{ studentId: student.id, status }] }),
        headers: { "content-type": "application/json" },
      });
      return postStatuses(request, { params: { id: String(assignment.id) } });
    }

    await save("submitted");
    const secondResponse = await save("pending");
    expect(secondResponse.status).toBe(200);

    const rows = await prisma.assignmentStatus.findMany({ where: { assignmentId: assignment.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("rejects a studentId outside the class with 400, all-or-nothing", async () => {
    const { school, klass, teacher, assignment } = await seedAssignmentWithStudents();
    const otherClass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 6", section: "B" },
    });
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Other Student",
        dob: new Date("2015-01-01"),
        classId: otherClass.id,
        section: "B",
        admissionNo: "SCH-602",
      },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ entries: [{ studentId: otherStudent.id, status: "submitted" }] }),
      headers: { "content-type": "application/json" },
    });
    const response = await postStatuses(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(400);

    const rows = await prisma.assignmentStatus.findMany({ where: { studentId: otherStudent.id } });
    expect(rows).toHaveLength(0);
  });

  it("rejects \"overdue\" as an input status with 400", async () => {
    const { school, teacher, student, assignment } = await seedAssignmentWithStudents();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ entries: [{ studentId: student.id, status: "overdue" }] }),
      headers: { "content-type": "application/json" },
    });
    const response = await postStatuses(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(400);
  });

  it("rejects a teacher not assigned to the class with 403 on POST", async () => {
    const { school, student, assignment } = await seedAssignmentWithStudents();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550025555", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ entries: [{ studentId: student.id, status: "submitted" }] }),
      headers: { "content-type": "application/json" },
    });
    const response = await postStatuses(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(403);
  });

  it("rejects an admin attempting to POST with 403", async () => {
    const { school, student, assignment } = await seedAssignmentWithStudents();
    const admin = await prisma.user.create({
      data: { phone: "+15550026666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      body: JSON.stringify({ entries: [{ studentId: student.id, status: "submitted" }] }),
      headers: { "content-type": "application/json" },
    });
    const response = await postStatuses(request, { params: { id: String(assignment.id) } });
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npm test -- assignments-api`
Expected: FAIL — `Cannot find module '../src/app/api/assignments/[id]/statuses/route'`

- [ ] **Step 3: Add `getAssignmentStatuses` and `updateAssignmentStatuses` to `src/lib/assignments.ts`**

Add below `editAssignment`, before the final `export { displayStatus, isOverdue };` line:

```typescript
export interface StatusEntry {
  studentId: number;
  name: string;
  status: "pending" | "submitted" | "overdue";
}

export type GetStatusesResult =
  | { ok: true; statuses: StatusEntry[] }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "NOT_ASSIGNED" };

export async function getAssignmentStatuses(
  prisma: PrismaClient,
  params: {
    assignmentId: number;
    schoolId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<GetStatusesResult> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { class: true },
  });
  if (!assignment || assignment.class.schoolId !== params.schoolId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (params.role === "teacher") {
    const link = await prisma.classTeacher.findFirst({
      where: { classId: assignment.classId, teacherUserId: params.userId },
    });
    if (!link) {
      return { ok: false, error: "NOT_ASSIGNED" };
    }
  }

  const statuses = await prisma.assignmentStatus.findMany({
    where: { assignmentId: params.assignmentId },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });

  return {
    ok: true,
    statuses: statuses.map((s) => ({
      studentId: s.studentId,
      name: s.student.name,
      status: displayStatus(s.status, assignment.dueDate),
    })),
  };
}

export type UpdateStatusesResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "STUDENT_MISMATCH" };

export async function updateAssignmentStatuses(
  prisma: PrismaClient,
  params: {
    assignmentId: number;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "pending" | "submitted" }>;
  }
): Promise<UpdateStatusesResult> {
  const assignment = await prisma.assignment.findUnique({ where: { id: params.assignmentId } });
  if (!assignment) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const link = await prisma.classTeacher.findFirst({
    where: { classId: assignment.classId, teacherUserId: params.teacherUserId },
  });
  if (!link) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const studentCount = await prisma.student.count({
    where: {
      classId: assignment.classId,
      id: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (studentCount !== params.entries.length) {
    return { ok: false, error: "STUDENT_MISMATCH" };
  }

  await prisma.$transaction(
    params.entries.map((entry) =>
      prisma.assignmentStatus.upsert({
        where: {
          assignmentId_studentId: { assignmentId: params.assignmentId, studentId: entry.studentId },
        },
        create: {
          assignmentId: params.assignmentId,
          studentId: entry.studentId,
          status: entry.status,
        },
        update: { status: entry.status },
      })
    )
  );

  return { ok: true };
}
```

- [ ] **Step 4: Write `src/app/api/assignments/[id]/statuses/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getAssignmentStatuses, updateAssignmentStatuses } from "@/lib/assignments";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);

    const assignmentId = Number(params.id);
    if (Number.isNaN(assignmentId)) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const result = await getAssignmentStatuses(prisma, {
      assignmentId,
      schoolId: claims.schoolId,
      role: claims.role,
      userId: claims.userId,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
    }

    return NextResponse.json({ statuses: result.statuses });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["teacher"]);

    const assignmentId = Number(params.id);
    if (Number.isNaN(assignmentId)) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    let entries: Array<{ studentId: number; status: string }> | undefined;
    try {
      ({ entries } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: "entries are required" }, { status: 400 });
    }
    for (const entry of entries) {
      if (entry.status !== "pending" && entry.status !== "submitted") {
        return NextResponse.json({ error: "status must be pending or submitted" }, { status: 400 });
      }
    }

    const result = await updateAssignmentStatuses(prisma, {
      assignmentId,
      teacherUserId: claims.userId,
      entries: entries as Array<{ studentId: number; status: "pending" | "submitted" }>,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      return NextResponse.json(
        { error: "One or more students do not belong to this class" },
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npm test -- assignments-api`
Expected: PASS (23 tests total)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/assignments.ts apps/web/src/app/api/assignments/[id]/statuses/route.ts apps/web/tests/assignments-api.test.ts
git commit -m "Add assignment submission-status roster API"
```

---

### Task 4: Assignments page — class selector, create form, list

**Files:**
- Create: `apps/web/src/app/dashboard/assignments/page.tsx`
- Create: `apps/web/src/components/assignments/AssignmentsView.tsx`

**Interfaces:**
- Consumes: `requireDashboardRole` from `src/lib/auth/require-dashboard-role.ts` (`requireDashboardRole(allowedRoles): SessionClaims`, redirects on failure); `getClassesForTeacher` from `src/lib/data/scoped-queries.ts` (`(prisma, teacherUserId) => Promise<Class[]>`, each `Class` has `id`, `name`, `section`); `listClasses` from `src/lib/school-setup/classes.ts` (`(prisma, schoolId) => Promise<ClassSummary[]>`); `prisma` from `src/lib/prisma.ts`. API endpoints `GET /api/assignments?classId=`, `POST /api/assignments` from Task 1.
- Produces: `AssignmentsView` React component (props: `classes: {id,name,section}[]`, `role: "teacher"|"admin"`, `currentUserId: number`) — Task 5's `AssignmentRoster` is rendered from inside this component when a row is clicked, so `AssignmentsView` must expose the selected assignment's `id`, `dueDate`, and `createdById` down to it.

This task is UI-only against a real dev server — no automated tests (consistent with `AttendanceView.tsx`, which has none either; correctness for this task is verified manually per the plan's final checklist in the writing-plans skill's parent workflow).

- [ ] **Step 1: Write `src/app/dashboard/assignments/page.tsx`**

```typescript
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { AssignmentsView } from "@/components/assignments/AssignmentsView";

export default async function AssignmentsPage() {
  const claims = requireDashboardRole(["teacher", "admin"]);
  const classes =
    claims.role === "teacher"
      ? (await getClassesForTeacher(prisma, claims.userId)).map((klass) => ({
          id: klass.id,
          name: klass.name,
          section: klass.section,
        }))
      : await listClasses(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Assignments</h1>
      <AssignmentsView
        classes={classes}
        role={claims.role === "teacher" ? "teacher" : "admin"}
        currentUserId={claims.userId}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/assignments/AssignmentsView.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { AssignmentRoster } from "./AssignmentRoster";

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

interface Assignment {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdById: number;
  submittedCount: number;
  totalCount: number;
  hasOverdue: boolean;
}

export function AssignmentsView({
  classes,
  role,
  currentUserId,
}: {
  classes: ClassOption[];
  role: "teacher" | "admin";
  currentUserId: number;
}) {
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (!classId) return;
    const response = await fetch(`/api/assignments?classId=${classId}`);
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      setAssignments([]);
      return;
    }
    const body = await response.json();
    setAssignments(body.assignments);
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    setSelectedId(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function handleCreate() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: Number(classId),
        subject,
        title,
        description: description || undefined,
        dueDate,
      }),
    });

    if (response.ok) {
      setMessage("Assignment posted");
      setSubject("");
      setTitle("");
      setDescription("");
      setDueDate("");
      await refresh();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="mt-4">
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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

      {role === "teacher" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="text"
            aria-label="Subject"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="text"
            aria-label="Title"
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="text"
            aria-label="Description"
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="date"
            aria-label="Due date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded bg-blue-600 px-3 py-2 text-white"
          >
            New Assignment
          </button>
        </div>
      )}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Title</th>
            <th className="border-b border-gray-200 pb-2">Subject</th>
            <th className="border-b border-gray-200 pb-2">Due date</th>
            <th className="border-b border-gray-200 pb-2">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr
              key={assignment.id}
              onClick={() => setSelectedId(assignment.id)}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="border-b border-gray-100 py-2">{assignment.title}</td>
              <td className="border-b border-gray-100 py-2">{assignment.subject}</td>
              <td className="border-b border-gray-100 py-2">{assignment.dueDate}</td>
              <td
                className={`border-b border-gray-100 py-2 ${
                  assignment.hasOverdue
                    ? "text-red-600"
                    : assignment.submittedCount === assignment.totalCount
                      ? "text-green-600"
                      : "text-amber-600"
                }`}
              >
                {assignment.submittedCount}/{assignment.totalCount} submitted
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <AssignmentRoster
          assignment={selected}
          role={role}
          currentUserId={currentUserId}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify with the dev server**

Run: `cd apps/web && npm run dev`, log in as a seeded teacher, navigate to `/dashboard/assignments`. Confirm the class selector loads, the create form posts a new assignment, and the list shows it with a `0/N submitted` badge. (`AssignmentRoster` import will fail to compile until Task 5 adds the file — this step just confirms the page compiles error-free once Task 5 lands; skip runtime verification until then.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/assignments/page.tsx apps/web/src/components/assignments/AssignmentsView.tsx
git commit -m "Add Assignments page with class selector, create form, and list"
```

---

### Task 5: Per-assignment roster component — status editing and assignment editing

**Files:**
- Create: `apps/web/src/components/assignments/AssignmentRoster.tsx`

**Interfaces:**
- Consumes: `Assignment` shape from Task 4's `AssignmentsView.tsx` (`{id, subject, title, description, dueDate, createdById, submittedCount, totalCount, hasOverdue}`); API endpoints `GET/POST /api/assignments/:id/statuses` from Task 3; `PATCH /api/assignments/:id` from Task 2.
- Produces: `AssignmentRoster` component (props: `assignment: Assignment`, `role: "teacher"|"admin"`, `currentUserId: number`, `onChanged: () => void` — called after a successful save or edit so the parent list refreshes its submission counts).

- [ ] **Step 1: Write `src/components/assignments/AssignmentRoster.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";

interface Assignment {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  dueDate: string;
  createdById: number;
}

interface StatusEntry {
  studentId: number;
  name: string;
  status: "pending" | "submitted" | "overdue";
}

export function AssignmentRoster({
  assignment,
  role,
  currentUserId,
  onChanged,
}: {
  assignment: Assignment;
  role: "teacher" | "admin";
  currentUserId: number;
  onChanged: () => void;
}) {
  const [statuses, setStatuses] = useState<StatusEntry[]>([]);
  const [edits, setEdits] = useState<Record<number, "pending" | "submitted">>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(assignment.title);
  const [editSubject, setEditSubject] = useState(assignment.subject);
  const [editDescription, setEditDescription] = useState(assignment.description ?? "");
  const [editDueDate, setEditDueDate] = useState(assignment.dueDate);

  async function refresh() {
    const response = await fetch(`/api/assignments/${assignment.id}/statuses`);
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      setStatuses([]);
      return;
    }
    const body = await response.json();
    setStatuses(body.statuses);
    const editMap: Record<number, "pending" | "submitted"> = {};
    for (const entry of body.statuses as StatusEntry[]) {
      editMap[entry.studentId] = entry.status === "overdue" ? "pending" : entry.status;
    }
    setEdits(editMap);
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    setEditing(false);
    setEditTitle(assignment.title);
    setEditSubject(assignment.subject);
    setEditDescription(assignment.description ?? "");
    setEditDueDate(assignment.dueDate);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id]);

  async function handleSave() {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/assignments/${assignment.id}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: statuses.map((entry) => ({
          studentId: entry.studentId,
          status: edits[entry.studentId] ?? "pending",
        })),
      }),
    });

    if (response.ok) {
      setMessage("Statuses saved");
      await refresh();
      onChanged();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  async function handleEditSave() {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/assignments/${assignment.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        subject: editSubject,
        description: editDescription || undefined,
        dueDate: editDueDate,
      }),
    });

    if (response.ok) {
      setMessage("Assignment updated");
      setEditing(false);
      await refresh();
      onChanged();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  const canEdit = role === "teacher" && assignment.createdById === currentUserId;

  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-800">{assignment.title}</h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-gray-300 px-3 py-1 text-sm"
          >
            Edit
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

      {editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="text"
            aria-label="Edit subject"
            value={editSubject}
            onChange={(event) => setEditSubject(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="text"
            aria-label="Edit title"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="text"
            aria-label="Edit description"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="date"
            aria-label="Edit due date"
            value={editDueDate}
            onChange={(event) => setEditDueDate(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={handleEditSave}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          >
            Save Changes
          </button>
        </div>
      )}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((entry) => (
            <tr key={entry.studentId}>
              <td className="border-b border-gray-100 py-2">{entry.name}</td>
              <td className="border-b border-gray-100 py-2">
                {role === "teacher" ? (
                  <select
                    aria-label={`Status for ${entry.name}`}
                    value={edits[entry.studentId] ?? "pending"}
                    onChange={(event) =>
                      setEdits((prev) => ({
                        ...prev,
                        [entry.studentId]: event.target.value as "pending" | "submitted",
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    <option value="pending">Pending</option>
                    <option value="submitted">Submitted</option>
                  </select>
                ) : (
                  <span
                    className={
                      entry.status === "overdue"
                        ? "text-red-600"
                        : entry.status === "submitted"
                          ? "text-green-600"
                          : "text-amber-600"
                    }
                  >
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </span>
                )}
                {role === "teacher" && entry.status === "overdue" && (
                  <span className="ml-2 text-xs text-red-600">(overdue)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {role === "teacher" && (
        <button
          type="button"
          onClick={handleSave}
          className="mt-4 rounded bg-blue-600 px-3 py-2 text-white"
        >
          Save
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify with the dev server**

Run: `cd apps/web && npm run dev` (start with `mcp__Claude_Preview__preview_start` if working via the preview tools).

Manual check as a seeded teacher:
1. Navigate to `/dashboard/assignments`, select a class, confirm the assignment list and create form render.
2. Create a new assignment; confirm it appears in the list with `0/N submitted`.
3. Click the row; confirm the roster below shows every student as "Pending".
4. Change one student to "Submitted", click Save; confirm the message "Statuses saved" appears and the list's badge updates to `1/N submitted`.
5. Click "Edit", change the title, click "Save Changes"; confirm the title updates in both the roster header and the list row.
6. Log in as admin; confirm the roster and list render read-only (no Edit button, no status `<select>`, no Save button).
7. Seed (or reuse) an assignment with a past due date and a still-"pending" student; confirm it displays "Overdue" for admin and the "(overdue)" tag next to the teacher's dropdown, and that submitting `"overdue"` is never possible from the UI (the select only offers Pending/Submitted).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/assignments/AssignmentRoster.tsx
git commit -m "Add per-assignment submission roster with status editing and assignment edit"
```
