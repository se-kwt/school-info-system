# Classes/Staff/Students Edit & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Edit and conditional Delete (hard delete when there's no history, deactivate/archive fallback otherwise) to the Classes, Staff, and Students admin pages.

**Architecture:** Schema first (two small additive fields), then a login-blocking change for deactivated staff, then each entity gets its lib functions + API routes + tests, then each entity's admin page is rebuilt as a self-contained client "View" component (matching the `AcademicYearsView` pattern already in this codebase) so Edit panels/Delete confirmations are interactive without full-page reloads.

**Tech Stack:** Next.js 14 route handlers, Prisma 5 (PostgreSQL), Vitest with a real Postgres test database, following the exact patterns in `src/lib/fee-payments.ts` and `src/components/academic-years/AcademicYearsView.tsx`.

## Global Constraints

- Every mutating lib function returns `{ ok: true, ... } | { ok: false, error: "..." }` — never throws for expected validation failures.
- Every route handler follows the `requireApiRole` + try/catch `AuthError` pattern already used everywhere.
- Delete is never a single irreversible action from the API's point of view: it either succeeds as a real delete, or fails with a `{ deletable: false }` shape the UI uses to offer the deactivate/archive fallback as a second, explicit call.
- A staff member can never delete or deactivate their own account.

---

## Task 1: Schema — `UserStatus` and `Class.archived`

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev --name user_status_and_class_archived`
- Modify: `apps/web/tests/classes-api.test.ts` (response shape gains `archived`)

**Interfaces produced:** `User.status: UserStatus` (`"active" | "inactive"`, default `"active"`), `Class.archived: boolean` (default `false`).

- [ ] In `apps/web/prisma/schema.prisma`, add the enum (alongside the other enums near the top):

```prisma
enum UserStatus {
  active
  inactive
}
```

- [ ] Add `status UserStatus @default(active)` to the `User` model, immediately after its `name` field:

```prisma
model User {
  id       Int        @id @default(autoincrement())
  phone    String     @unique
  role     Role
  name     String
  status   UserStatus @default(active)
  school   School     @relation(fields: [schoolId], references: [id])
  schoolId Int
  // ...rest unchanged...
```

- [ ] Add `archived Boolean @default(false)` to the `Class` model, immediately after its `section` field:

```prisma
model Class {
  id       Int     @id @default(autoincrement())
  school   School  @relation(fields: [schoolId], references: [id])
  schoolId Int
  name     String
  section  String
  archived Boolean @default(false)
  // ...rest unchanged...
```

- [ ] Run the migration:

```bash
cd apps/web && npx prisma migrate dev --name user_status_and_class_archived
```

Expected: applies cleanly with no data-loss warning (both are additive columns with defaults).

- [ ] Update `apps/web/tests/classes-api.test.ts` — the `"creates a class and lists it"` test's exact-match assertions need the new field. Change:

```ts
    expect(created).toMatchObject({ name: "Grade 6", section: "B" });

    const getResponse = await getClasses();
    expect(getResponse.status).toBe(200);
    const list = await getResponse.json();
    expect(list).toEqual([{ id: created.id, name: "Grade 6", section: "B" }]);
```

to:

```ts
    expect(created).toMatchObject({ name: "Grade 6", section: "B" });

    const getResponse = await getClasses();
    expect(getResponse.status).toBe(200);
    const list = await getResponse.json();
    expect(list).toEqual([{ id: created.id, name: "Grade 6", section: "B", archived: false }]);
```

- [ ] Run: `cd apps/web && npx vitest run tests/classes-api.test.ts`. Expected: PASS.

- [ ] Commit:

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations apps/web/tests/classes-api.test.ts
git commit -m "Add UserStatus and Class.archived for staff/class deactivation"
```

---

## Task 2: Block login for deactivated staff

**Files:**
- Modify: `apps/web/src/lib/auth/send-otp.ts`, `apps/web/src/lib/auth/verify-otp.ts`
- Modify: `apps/web/tests/send-otp.test.ts`, `apps/web/tests/verify-otp.test.ts`

**Interfaces consumed:** `User.status` (Task 1).

### Step 1: `sendOtp` rejects a deactivated user exactly like an unregistered one

- [ ] Write the failing test — add to the `describe("sendOtp", ...)` block in `apps/web/tests/send-otp.test.ts`:

```ts
  it("rejects a deactivated user's phone exactly like an unregistered one", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: {
        phone: "+15550002222",
        role: "teacher",
        name: "Deactivated Teacher",
        schoolId: school.id,
        status: "inactive",
      },
    });

    const smsSender = new FakeSmsSender();
    await expect(sendOtp("+15550002222", { prisma, smsSender })).rejects.toThrow(
      "PHONE_NOT_REGISTERED"
    );
    expect(smsSender.sentMessages).toHaveLength(0);
  });
```

- [ ] Run: `cd apps/web && npx vitest run tests/send-otp.test.ts`. Expected: FAIL (no OTP is currently blocked for inactive users, so the current code sends one and the `rejects.toThrow` assertion fails).

- [ ] In `apps/web/src/lib/auth/send-otp.ts`, change:

```ts
  const user = await deps.prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new Error("PHONE_NOT_REGISTERED");
  }
```

to:

```ts
  const user = await deps.prisma.user.findUnique({ where: { phone } });
  if (!user || user.status === "inactive") {
    throw new Error("PHONE_NOT_REGISTERED");
  }
```

- [ ] Run: `cd apps/web && npx vitest run tests/send-otp.test.ts`. Expected: PASS.

- [ ] Commit: `git add apps/web/src/lib/auth/send-otp.ts apps/web/tests/send-otp.test.ts && git commit -m "Block OTP send for deactivated staff"`

### Step 2: `verifyOtp` also rejects a deactivated user (covers an already-issued OTP)

Closes the narrow window where an OTP was sent before deactivation and is still within its 5-minute TTL when the user is deactivated.

- [ ] Write the failing test — this file's existing pattern (see every other test in it) is to call the real `sendOtp` to seed a genuine OTP, then read the code back out of the fake SMS sender's captured message via `extractCode` (no direct OTP-hashing import exists in this file — don't add one). Add this test inside the existing `describe("verifyOtp", ...)` block in `apps/web/tests/verify-otp.test.ts`, right after the `"rejects reuse of an already-verified code"` test:

```ts
  it("rejects verification for a user deactivated after their OTP was issued", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const user = await prisma.user.create({
      data: { phone: "+15550006666", role: "teacher", name: "Soon Deactivated", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550006666", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    await prisma.user.update({ where: { id: user.id }, data: { status: "inactive" } });

    const result = await verifyOtp("+15550006666", code, { prisma });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });
```

- [ ] Run: `cd apps/web && npx vitest run tests/verify-otp.test.ts`. Expected: FAIL (currently succeeds and issues a token).

- [ ] In `apps/web/src/lib/auth/verify-otp.ts`, change the final section from:

```ts
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { phone } });

  const token = signSessionToken({
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });

  return { ok: true, token };
```

to:

```ts
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { phone } });
  if (user.status === "inactive") {
    return { ok: false, error: "NOT_FOUND" };
  }

  const token = signSessionToken({
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });

  return { ok: true, token };
```

- [ ] Run: `cd apps/web && npx vitest run tests/verify-otp.test.ts`. Expected: PASS.

- [ ] Commit: `git add apps/web/src/lib/auth/verify-otp.ts apps/web/tests/verify-otp.test.ts && git commit -m "Block OTP verification for deactivated staff"`

---

## Task 3: Classes — edit, delete, archive (lib + routes)

**Files:**
- Modify: `apps/web/src/lib/school-setup/classes.ts`
- Modify: `apps/web/src/app/api/classes/route.ts`
- Create: `apps/web/src/app/api/classes/[id]/route.ts`
- Create: `apps/web/src/app/api/classes/[id]/archive/route.ts`
- Modify: `apps/web/tests/classes-api.test.ts`

**Interfaces produced (used by Task 4's UI):**
- `listClasses(prisma, schoolId, options?: { includeArchived?: boolean }): Promise<ClassSummary[]>` — `ClassSummary` now includes `archived: boolean`.
- `editClass(prisma, { classId, schoolId, fields }): Promise<EditClassResult>`
- `deleteClass(prisma, { classId, schoolId }): Promise<DeleteClassResult>`
- `archiveClass(prisma, { classId, schoolId }): Promise<ArchiveClassResult>`

### Step 1: `listClasses` gains `archived` and an `includeArchived` option

- [ ] Write the failing test — add to `apps/web/tests/classes-api.test.ts`:

```ts
  it("excludes archived classes by default but includes them with includeArchived=true", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const active = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });
    await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 10", section: "A", archived: true },
    });

    const defaultResponse = await getClasses(new Request("http://localhost/api/classes"));
    const defaultList = await defaultResponse.json();
    expect(defaultList).toEqual([{ id: active.id, name: "Grade 9", section: "A", archived: false }]);

    const allResponse = await getClasses(
      new Request("http://localhost/api/classes?includeArchived=true")
    );
    const allList = await allResponse.json();
    expect(allList).toHaveLength(2);
  });
```

- [ ] Run: `cd apps/web && npx vitest run tests/classes-api.test.ts`. Expected: FAIL — `getClasses()` currently takes no arguments (it's `export async function GET()`), so passing a `Request` won't yet change behavior, and the archived row won't be excluded/included correctly.

- [ ] In `apps/web/src/lib/school-setup/classes.ts`, replace the whole file with:

```ts
import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface ClassSummary {
  id: number;
  name: string;
  section: string;
  archived: boolean;
}

export async function listClasses(
  prisma: PrismaClient,
  schoolId: number,
  options?: { includeArchived?: boolean }
): Promise<ClassSummary[]> {
  return prisma.class.findMany({
    where: options?.includeArchived ? { schoolId } : { schoolId, archived: false },
    select: { id: true, name: true, section: true, archived: true },
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

  try {
    const created = await prisma.class.create({
      data: { schoolId, name: input.name, section: input.section },
      select: { id: true, name: true, section: true, archived: true },
    });
    return { ok: true, class: created };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE" };
    }
    throw err;
  }
}

export type EditClassResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE" };

export async function editClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; fields: { name?: string; section?: string } }
): Promise<EditClassResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const nextName = params.fields.name ?? klass.name;
  const nextSection = params.fields.section ?? klass.section;
  const duplicate = await prisma.class.findFirst({
    where: {
      schoolId: params.schoolId,
      name: nextName,
      section: nextSection,
      id: { not: params.classId },
    },
  });
  if (duplicate) {
    return { ok: false, error: "DUPLICATE" };
  }

  try {
    await prisma.class.update({
      where: { id: params.classId },
      data: { name: params.fields.name, section: params.fields.section },
    });
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE" };
    }
    throw err;
  }
}

export type DeleteClassResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number }
): Promise<DeleteClassResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const [enrollmentCount, classTeacherCount, timetableCount, assignmentCount, feeStructureCount, mappingCount] =
    await Promise.all([
      prisma.enrollment.count({ where: { classId: params.classId } }),
      prisma.classTeacher.count({ where: { classId: params.classId } }),
      prisma.timetableEntry.count({ where: { classId: params.classId } }),
      prisma.assignment.count({ where: { classId: params.classId } }),
      prisma.feeStructure.count({ where: { classId: params.classId } }),
      prisma.promotionMapping.count({
        where: { OR: [{ fromClassId: params.classId }, { toClassId: params.classId }] },
      }),
    ]);

  const hasHistory =
    enrollmentCount + classTeacherCount + timetableCount + assignmentCount + feeStructureCount + mappingCount > 0;
  if (hasHistory) {
    return { ok: false, error: "HAS_HISTORY" };
  }

  await prisma.class.delete({ where: { id: params.classId } });
  return { ok: true, deleted: true };
}

export type ArchiveClassResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function archiveClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number }
): Promise<ArchiveClassResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId },
  });
  if (!klass) {
    return { ok: false, error: "NOT_FOUND" };
  }

  await prisma.class.update({ where: { id: params.classId }, data: { archived: true } });
  return { ok: true };
}
```

- [ ] Replace `apps/web/src/app/api/classes/route.ts`'s `GET` with (keep `POST` unchanged):

```ts
export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    const classes = await listClasses(prisma, claims.schoolId, { includeArchived });
    return NextResponse.json(classes);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Run: `cd apps/web && npx vitest run tests/classes-api.test.ts`. Expected: PASS (all tests, including the new one and the pre-existing `"creates a class and lists it"` one, which calls `getClasses()` with no arguments — confirm `new URL(request.url)` doesn't blow up on a missing `request`; since every existing call site in this test file needs updating to pass a `Request` now that `GET` takes one, see next step).

- [ ] Every existing call to `getClasses()` in `apps/web/tests/classes-api.test.ts` (there are two: in `"creates a class and lists it"` and `"rejects an unauthenticated request with 401"`) must become `getClasses(new Request("http://localhost/api/classes"))` since `GET` now requires a `Request` parameter. Update both call sites.

- [ ] Re-run: `cd apps/web && npx vitest run tests/classes-api.test.ts`. Expected: all pass.

- [ ] Commit: `git add apps/web/src/lib/school-setup/classes.ts apps/web/src/app/api/classes/route.ts apps/web/tests/classes-api.test.ts && git commit -m "Add archived filtering to listClasses"`

### Step 2: Edit/Delete/Archive routes

- [ ] Create `apps/web/src/app/api/classes/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { editClass, deleteClass } from "@/lib/school-setup/classes";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const classId = Number(params.id);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    let body: { name?: string; section?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.name === undefined && body.section === undefined) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const result = await editClass(prisma, { classId, schoolId: claims.schoolId, fields: body });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "A class with this name and section already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const classId = Number(params.id);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const result = await deleteClass(prisma, { classId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }
      return NextResponse.json(
        {
          error: "This class has enrollment or scheduling history and cannot be deleted",
          deletable: false,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/src/app/api/classes/[id]/archive/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { archiveClass } from "@/lib/school-setup/classes";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const classId = Number(params.id);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const result = await archiveClass(prisma, { classId, schoolId: claims.schoolId });
    if (!result.ok) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Write the route tests — add a new `describe` block to `apps/web/tests/classes-api.test.ts`:

```ts
describe("/api/classes/[id]", () => {
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
      data: { phone: "+15551110020", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("edits a class's name and section", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Grade 9", section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchClass(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(updated?.section).toBe("B");
  });

  it("rejects an edit that collides with another class's name+section", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    await prisma.class.create({ data: { schoolId: school.id, name: "Grade 9", section: "B" } });
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, {
      method: "PATCH",
      body: JSON.stringify({ section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchClass(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(409);
  });

  it("deletes a class with zero history", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, { method: "DELETE" });
    const response = await deleteClassRoute(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(200);

    const found = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(found).toBeNull();
  });

  it("rejects deleting a class with an enrollment, offering deletable: false", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-CLS-1",
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}`, { method: "DELETE" });
    const response = await deleteClassRoute(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.deletable).toBe(false);

    const stillExists = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(stillExists).not.toBeNull();
  });

  it("archives a class", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });

    const request = new Request(`http://localhost/api/classes/${klass.id}/archive`, { method: "PATCH" });
    const response = await archiveClassRoute(request, { params: { id: String(klass.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.class.findUnique({ where: { id: klass.id } });
    expect(updated?.archived).toBe(true);
  });

  it("returns 404 for a cross-school class id on PATCH/DELETE/archive", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });

    const patchResponse = await patchClass(
      new Request(`http://localhost/api/classes/${otherClass.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Hijack" }),
        headers: { "content-type": "application/json" },
      }),
      { params: { id: String(otherClass.id) } }
    );
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await deleteClassRoute(
      new Request(`http://localhost/api/classes/${otherClass.id}`, { method: "DELETE" }),
      { params: { id: String(otherClass.id) } }
    );
    expect(deleteResponse.status).toBe(404);
  });
});
```

- [ ] Add the new imports to the top of `apps/web/tests/classes-api.test.ts`:

```ts
import { createActiveYear, createEnrolledStudent } from "./helpers/enrollment";
import { PATCH as patchClass, DELETE as deleteClassRoute } from "../src/app/api/classes/[id]/route";
import { PATCH as archiveClassRoute } from "../src/app/api/classes/[id]/archive/route";
```

- [ ] Run: `cd apps/web && npx vitest run tests/classes-api.test.ts`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/app/api/classes apps/web/tests/classes-api.test.ts
git commit -m "Add Class edit/delete/archive API routes"
```

---

## Task 4: Classes — UI (ClassesView)

**Files:**
- Create: `apps/web/src/components/school-setup/ClassesView.tsx`
- Modify: `apps/web/src/app/dashboard/classes/page.tsx`
- Delete: `apps/web/src/components/school-setup/CreateClassForm.tsx` (folded into `ClassesView`)

**Interfaces consumed:** `GET/POST /api/classes`, `PATCH/DELETE /api/classes/:id`, `PATCH /api/classes/:id/archive` (Task 3).

- [ ] Create `apps/web/src/components/school-setup/ClassesView.tsx`:

```tsx
"use client";

import { Fragment, useState } from "react";

interface ClassRow {
  id: number;
  name: string;
  section: string;
  archived: boolean;
}

export function ClassesView({ initialClasses }: { initialClasses: ClassRow[] }) {
  const [classes, setClasses] = useState(initialClasses);
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSection, setEditSection] = useState("");
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/classes?includeArchived=true");
    setClasses(await response.json());
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch("/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, section }),
    });
    if (response.status === 201) {
      setName("");
      setSection("");
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(klass: ClassRow) {
    setEditingId(klass.id);
    setEditName(klass.name);
    setEditSection(klass.section);
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: editName, section: editSection }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleteBlockedId(null);
      await refresh();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(id);
      return;
    }
    setError(body.error);
  }

  async function handleArchive(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}/archive`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setDeleteBlockedId(null);
    await refresh();
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
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
        <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">
          Create Class
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Section</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((klass) => (
            <Fragment key={klass.id}>
              <tr>
                <td className="border-b border-gray-100 py-2">{klass.name}</td>
                <td className="border-b border-gray-100 py-2">{klass.section}</td>
                <td className="border-b border-gray-100 py-2">
                  {klass.archived && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Archived</span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  <button type="button" onClick={() => startEdit(klass)} className="mr-3 text-blue-600 underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(klass.id)} className="text-red-600 underline">
                    Delete
                  </button>
                </td>
              </tr>
              {editingId === klass.id && (
                <tr>
                  <td colSpan={4} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex items-center gap-2 px-2">
                      <input
                        type="text"
                        aria-label={`Edit name for ${klass.name}`}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <input
                        type="text"
                        aria-label={`Edit section for ${klass.name}`}
                        value={editSection}
                        onChange={(event) => setEditSection(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(klass.id)}
                        className="rounded bg-blue-600 px-2 py-1 text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {deleteBlockedId === klass.id && (
                <tr>
                  <td colSpan={4} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex items-center gap-2 px-2 text-sm">
                      <span>{klass.name} has history and cannot be permanently deleted.</span>
                      <button
                        type="button"
                        onClick={() => handleArchive(klass.id)}
                        className="rounded bg-amber-600 px-2 py-1 text-white"
                      >
                        Archive instead
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteBlockedId(null)}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] Replace `apps/web/src/app/dashboard/classes/page.tsx` with:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { ClassesView } from "@/components/school-setup/ClassesView";

export default async function ClassesPage() {
  const claims = requireDashboardRole(["admin"]);
  const classes = await listClasses(prisma, claims.schoolId, { includeArchived: true });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Classes</h1>
      <ClassesView initialClasses={classes} />
    </div>
  );
}
```

- [ ] Delete `apps/web/src/components/school-setup/CreateClassForm.tsx` (its create-form logic is now inside `ClassesView`):

```bash
rm apps/web/src/components/school-setup/CreateClassForm.tsx
```

- [ ] Run the full suite to confirm nothing else imports `CreateClassForm`: `cd apps/web && npm run build`. Expected: succeeds (no leftover import errors).

- [ ] Manually verify in the browser (`preview_start`/`preview_click`/`preview_snapshot`): log in as admin, open `/dashboard/classes`, create a class, edit its section, delete a fresh class with no history (confirms it disappears), then create one, enroll a student into it via `/dashboard/students`, and attempt to delete that class from `/dashboard/classes` — confirm it offers "Archive instead" and the archived badge appears afterward.

- [ ] Commit:

```bash
git add apps/web/src/components/school-setup/ClassesView.tsx apps/web/src/app/dashboard/classes/page.tsx
git rm apps/web/src/components/school-setup/CreateClassForm.tsx
git commit -m "Add Edit/Delete/Archive UI to Classes page"
```

---

## Task 5: Staff — edit, delete, deactivate (lib + routes)

**Files:**
- Modify: `apps/web/src/lib/school-setup/staff.ts`
- Create: `apps/web/src/app/api/staff/[id]/route.ts`
- Create: `apps/web/src/app/api/staff/[id]/deactivate/route.ts`
- Modify: `apps/web/tests/staff-api.test.ts`

**Interfaces consumed:** `getActiveAcademicYear` (from `src/lib/academic-years.ts`).

**Interfaces produced (used by Task 6's UI):**
- `StaffSummary` gains `status: "active" | "inactive"`.
- `editStaff(prisma, { userId, schoolId, academicYearId, fields }): Promise<EditStaffResult>`
- `deleteStaff(prisma, { userId, schoolId, requestingUserId }): Promise<DeleteStaffResult>`
- `deactivateStaff(prisma, { userId, schoolId, requestingUserId, academicYearId }): Promise<DeactivateStaffResult>`

### Step 1: Lib functions

- [ ] Replace `apps/web/src/lib/school-setup/staff.ts` with:

```ts
import type { PrismaClient, Role } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface StaffSummary {
  id: number;
  name: string;
  phone: string;
  role: Role;
  status: "active" | "inactive";
  classAssignment: { className: string; section: string; subject: string } | null;
}

export async function listStaff(prisma: PrismaClient, schoolId: number): Promise<StaffSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });

  const users = await prisma.user.findMany({
    where: { schoolId, role: { in: ["teacher", "admin", "accountant"] } },
    include: {
      classesTaught: {
        where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
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
      status: user.status,
      classAssignment: assignment
        ? { className: assignment.class.name, section: assignment.class.section, subject: assignment.subject }
        : null,
    };
  });
}

export type CreateStaffResult =
  | { ok: true; staff: { id: number; name: string; phone: string; role: Role } }
  | { ok: false; error: "DUPLICATE_PHONE" }
  | { ok: false; error: "INVALID_CLASS" };

export async function createStaff(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: { name: string; phone: string; role: Role; classId?: number; subject?: string }
): Promise<CreateStaffResult> {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    return { ok: false, error: "DUPLICATE_PHONE" };
  }

  if (input.role === "teacher" && input.classId) {
    const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
    if (!targetClass) {
      return { ok: false, error: "INVALID_CLASS" };
    }
  }

  try {
    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { schoolId, name: input.name, phone: input.phone, role: input.role },
      });

      if (input.role === "teacher" && input.classId && input.subject) {
        await tx.classTeacher.create({
          data: { classId: input.classId, teacherUserId: created.id, subject: input.subject, academicYearId },
        });
      }

      return created;
    });

    return {
      ok: true,
      staff: { id: staff.id, name: staff.name, phone: staff.phone, role: staff.role },
    };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_PHONE" };
    }
    throw err;
  }
}

export type EditStaffResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_PHONE" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "ROLE_CLASS_MISMATCH" }
  | { ok: false; error: "SUBJECT_REQUIRED" }
  | { ok: false; error: "NO_ACTIVE_YEAR" };

export async function editStaff(
  prisma: PrismaClient,
  params: {
    userId: number;
    schoolId: number;
    academicYearId: number | null;
    fields: {
      name?: string;
      phone?: string;
      role?: Role;
      classId?: number | null;
      subject?: string | null;
    };
  }
): Promise<EditStaffResult> {
  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (params.fields.phone && params.fields.phone !== user.phone) {
    const existing = await prisma.user.findUnique({ where: { phone: params.fields.phone } });
    if (existing) {
      return { ok: false, error: "DUPLICATE_PHONE" };
    }
  }

  const nextRole = params.fields.role ?? user.role;
  const assigningClass = params.fields.classId !== undefined && params.fields.classId !== null;

  if (assigningClass && nextRole !== "teacher") {
    return { ok: false, error: "ROLE_CLASS_MISMATCH" };
  }
  if (assigningClass && !params.fields.subject) {
    return { ok: false, error: "SUBJECT_REQUIRED" };
  }
  if (assigningClass) {
    const targetClass = await prisma.class.findFirst({
      where: { id: params.fields.classId as number, schoolId: params.schoolId },
    });
    if (!targetClass) {
      return { ok: false, error: "INVALID_CLASS" };
    }
    if (!params.academicYearId) {
      return { ok: false, error: "NO_ACTIVE_YEAR" };
    }
  }

  await prisma.$transaction(async (tx) => {
    const data: { name?: string; phone?: string; role?: Role } = {};
    if (params.fields.name !== undefined) data.name = params.fields.name;
    if (params.fields.phone !== undefined) data.phone = params.fields.phone;
    if (params.fields.role !== undefined) data.role = params.fields.role;
    if (Object.keys(data).length > 0) {
      await tx.user.update({ where: { id: params.userId }, data });
    }

    const shouldClearAssignment = nextRole !== "teacher" || params.fields.classId === null;
    if ((shouldClearAssignment || assigningClass) && params.academicYearId) {
      await tx.classTeacher.deleteMany({
        where: { teacherUserId: params.userId, academicYearId: params.academicYearId },
      });
    }

    if (assigningClass && params.academicYearId) {
      await tx.classTeacher.create({
        data: {
          classId: params.fields.classId as number,
          teacherUserId: params.userId,
          subject: params.fields.subject as string,
          academicYearId: params.academicYearId,
        },
      });
    }
  });

  return { ok: true };
}

export type DeleteStaffResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "SELF" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteStaff(
  prisma: PrismaClient,
  params: { userId: number; schoolId: number; requestingUserId: number }
): Promise<DeleteStaffResult> {
  if (params.userId === params.requestingUserId) {
    return { ok: false, error: "SELF" };
  }

  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const [attendanceCount, assignmentCount, feePaymentCount, timetableCount, promotionRunCount] = await Promise.all([
    prisma.attendance.count({ where: { markedById: params.userId } }),
    prisma.assignment.count({ where: { createdById: params.userId } }),
    prisma.feePayment.count({ where: { recordedById: params.userId } }),
    prisma.timetableEntry.count({ where: { teacherUserId: params.userId } }),
    prisma.promotionRun.count({ where: { initiatedById: params.userId } }),
  ]);

  const hasHistory =
    attendanceCount + assignmentCount + feePaymentCount + timetableCount + promotionRunCount > 0;
  if (hasHistory) {
    return { ok: false, error: "HAS_HISTORY" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.classTeacher.deleteMany({ where: { teacherUserId: params.userId } });
    await tx.user.delete({ where: { id: params.userId } });
  });

  return { ok: true, deleted: true };
}

export type DeactivateStaffResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "SELF" };

export async function deactivateStaff(
  prisma: PrismaClient,
  params: { userId: number; schoolId: number; requestingUserId: number; academicYearId: number | null }
): Promise<DeactivateStaffResult> {
  if (params.userId === params.requestingUserId) {
    return { ok: false, error: "SELF" };
  }

  const user = await prisma.user.findFirst({ where: { id: params.userId, schoolId: params.schoolId } });
  if (!user) {
    return { ok: false, error: "NOT_FOUND" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: params.userId }, data: { status: "inactive" } });
    if (params.academicYearId) {
      await tx.classTeacher.deleteMany({
        where: { teacherUserId: params.userId, academicYearId: params.academicYearId },
      });
    }
  });

  return { ok: true };
}
```

- [ ] `listStaff` now returns `status` — update the two `toMatchObject`/list assertions in `apps/web/tests/staff-api.test.ts`'s existing tests only if they use exact `toEqual` (they currently use `toMatchObject`, which ignores extra fields, so **no change needed** there — confirm this by re-reading the file before editing anything else in it).

- [ ] Run: `cd apps/web && npx vitest run tests/staff-api.test.ts`. Expected: still passes unchanged (no behavior change yet, just added fields/functions not yet wired to routes).

- [ ] Commit: `git add apps/web/src/lib/school-setup/staff.ts && git commit -m "Add editStaff/deleteStaff/deactivateStaff"`

### Step 2: Routes and tests

- [ ] Create `apps/web/src/app/api/staff/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { editStaff, deleteStaff } from "@/lib/school-setup/staff";
import { getActiveAcademicYear } from "@/lib/academic-years";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const userId = Number(params.id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    let body: {
      name?: string;
      phone?: string;
      role?: "teacher" | "admin" | "accountant";
      classId?: number | null;
      subject?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);

    const result = await editStaff(prisma, {
      userId,
      schoolId: claims.schoolId,
      academicYearId: activeYear?.id ?? null,
      fields: body,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      }
      if (result.error === "DUPLICATE_PHONE") {
        return NextResponse.json({ error: "This phone number is already registered" }, { status: 409 });
      }
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      if (result.error === "ROLE_CLASS_MISMATCH") {
        return NextResponse.json({ error: "Only a teacher can have a class assignment" }, { status: 400 });
      }
      if (result.error === "SUBJECT_REQUIRED") {
        return NextResponse.json({ error: "subject is required when assigning a class" }, { status: 400 });
      }
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const userId = Number(params.id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const result = await deleteStaff(prisma, {
      userId,
      schoolId: claims.schoolId,
      requestingUserId: claims.userId,
    });

    if (!result.ok) {
      if (result.error === "SELF") {
        return NextResponse.json({ error: "You cannot delete your own account" }, { status: 403 });
      }
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "This staff member has recorded activity and cannot be deleted", deletable: false },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/src/app/api/staff/[id]/deactivate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { deactivateStaff } from "@/lib/school-setup/staff";
import { getActiveAcademicYear } from "@/lib/academic-years";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const userId = Number(params.id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);

    const result = await deactivateStaff(prisma, {
      userId,
      schoolId: claims.schoolId,
      requestingUserId: claims.userId,
      academicYearId: activeYear?.id ?? null,
    });

    if (!result.ok) {
      if (result.error === "SELF") {
        return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 403 });
      }
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Add a new `describe` block to `apps/web/tests/staff-api.test.ts` (add `import { createActiveYear } from "./helpers/enrollment";` if not already present — it already is, per the existing file — plus `import { PATCH as patchStaff, DELETE as deleteStaffRoute } from "../src/app/api/staff/[id]/route";` and `import { PATCH as deactivateStaffRoute } from "../src/app/api/staff/[id]/deactivate/route";`):

```ts
describe("/api/staff/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedAdminAndTeacher(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15559991001", role: "admin", name: "Test Admin", schoolId },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15559991002", role: "teacher", name: "Test Teacher", schoolId },
    });
    return { admin, teacher };
  }

  function loginAs(userId: number, schoolId: number) {
    const token = signSessionToken({ userId, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("edits name, phone, and role", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed Teacher", role: "accountant" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStaff(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: teacher.id } });
    expect(updated).toMatchObject({ name: "Renamed Teacher", role: "accountant" });
  });

  it("assigns a class+subject to a teacher when an active year exists", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, {
      method: "PATCH",
      body: JSON.stringify({ classId: klass.id, subject: "Math" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStaff(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const assignment = await prisma.classTeacher.findFirst({
      where: { teacherUserId: teacher.id, academicYearId: year.id },
    });
    expect(assignment).toMatchObject({ classId: klass.id, subject: "Math" });
  });

  it("clears a class assignment when role changes away from teacher", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math", academicYearId: year.id },
    });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "accountant" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStaff(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const assignment = await prisma.classTeacher.findFirst({ where: { teacherUserId: teacher.id } });
    expect(assignment).toBeNull();
  });

  it("rejects assigning a class to a non-teacher role with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "accountant", classId: klass.id, subject: "Math" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStaff(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(400);
  });

  it("deletes a staff member with zero recorded activity", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, { method: "DELETE" });
    const response = await deleteStaffRoute(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const found = await prisma.user.findUnique({ where: { id: teacher.id } });
    expect(found).toBeNull();
  });

  it("rejects deleting a staff member with recorded activity, offering deactivate", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    await prisma.timetableEntry.create({
      data: { classId: klass.id, dayOfWeek: 1, period: 1, subject: "Math", teacherUserId: teacher.id, academicYearId: year.id },
    });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}`, { method: "DELETE" });
    const response = await deleteStaffRoute(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.deletable).toBe(false);
  });

  it("rejects deleting your own account with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${admin.id}`, { method: "DELETE" });
    const response = await deleteStaffRoute(request, { params: { id: String(admin.id) } });
    expect(response.status).toBe(403);
  });

  it("deactivates a staff member and clears their current-year assignment", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const { admin, teacher } = await seedAdminAndTeacher(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math", academicYearId: year.id },
    });
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${teacher.id}/deactivate`, { method: "PATCH" });
    const response = await deactivateStaffRoute(request, { params: { id: String(teacher.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: teacher.id } });
    expect(updated?.status).toBe("inactive");
    const assignment = await prisma.classTeacher.findFirst({ where: { teacherUserId: teacher.id } });
    expect(assignment).toBeNull();
  });

  it("rejects deactivating your own account with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const { admin } = await seedAdminAndTeacher(school.id);
    loginAs(admin.id, school.id);

    const request = new Request(`http://localhost/api/staff/${admin.id}/deactivate`, { method: "PATCH" });
    const response = await deactivateStaffRoute(request, { params: { id: String(admin.id) } });
    expect(response.status).toBe(403);
  });
});
```

- [ ] Run: `cd apps/web && npx vitest run tests/staff-api.test.ts`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/app/api/staff apps/web/tests/staff-api.test.ts
git commit -m "Add Staff edit/delete/deactivate API routes"
```

---

## Task 6: Staff — UI (StaffView)

**Files:**
- Create: `apps/web/src/components/school-setup/StaffView.tsx`
- Modify: `apps/web/src/app/dashboard/staff/page.tsx`
- Delete: `apps/web/src/components/school-setup/CreateStaffForm.tsx`

**Interfaces consumed:** `GET/POST /api/staff`, `PATCH/DELETE /api/staff/:id`, `PATCH /api/staff/:id/deactivate` (Task 5).

- [ ] Create `apps/web/src/components/school-setup/StaffView.tsx`:

```tsx
"use client";

import { Fragment, useState } from "react";

type Role = "teacher" | "admin" | "accountant";

interface StaffRow {
  id: number;
  name: string;
  phone: string;
  role: Role;
  status: "active" | "inactive";
  classAssignment: { className: string; section: string; subject: string } | null;
}

export function StaffView({
  initialStaff,
  classes,
  currentUserId,
}: {
  initialStaff: StaffRow[];
  classes: { id: number; name: string; section: string }[];
  currentUserId: number;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<Role>("teacher");
  const [editClassId, setEditClassId] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/staff");
    setStaff(await response.json());
  }

  async function handleCreate() {
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
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(member: StaffRow) {
    setEditingId(member.id);
    setEditName(member.name);
    setEditPhone(member.phone);
    setEditRole(member.role);
    setEditClassId(""); // class dropdown is set from the assignment below via key/defaultValue-free select
    setEditSubject(member.classAssignment?.subject ?? "");
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);
    const body: {
      name: string;
      phone: string;
      role: Role;
      classId?: number | null;
      subject?: string | null;
    } = { name: editName, phone: editPhone, role: editRole };
    if (editRole === "teacher") {
      body.classId = editClassId ? Number(editClassId) : null;
      body.subject = editClassId ? editSubject : null;
    } else {
      body.classId = null;
    }

    const response = await fetch(`/api/staff/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/staff/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleteBlockedId(null);
      await refresh();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(id);
      return;
    }
    setError(body.error);
  }

  async function handleDeactivate(id: number) {
    setError(null);
    const response = await fetch(`/api/staff/${id}/deactivate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setDeleteBlockedId(null);
    await refresh();
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2">
        <input type="text" aria-label="Staff name" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-300 px-3 py-2" placeholder="Name" />
        <input type="tel" aria-label="Staff phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded border border-gray-300 px-3 py-2" placeholder="Phone number" />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded border border-gray-300 px-3 py-2">
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
        </select>
        {role === "teacher" && (
          <>
            <select aria-label="Assign class" value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded border border-gray-300 px-3 py-2">
              <option value="">No class assignment</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>{klass.name} {klass.section}</option>
              ))}
            </select>
            <input type="text" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded border border-gray-300 px-3 py-2" placeholder="Subject (required if assigning a class)" />
          </>
        )}
        <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">Create Staff</button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Phone</th>
            <th className="border-b border-gray-200 pb-2">Role</th>
            <th className="border-b border-gray-200 pb-2">Class Assignment</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <Fragment key={member.id}>
              <tr>
                <td className="border-b border-gray-100 py-2">{member.name}</td>
                <td className="border-b border-gray-100 py-2">{member.phone}</td>
                <td className="border-b border-gray-100 py-2">{member.role}</td>
                <td className="border-b border-gray-100 py-2">
                  {member.classAssignment
                    ? `${member.classAssignment.className} ${member.classAssignment.section} (${member.classAssignment.subject})`
                    : "—"}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {member.status === "inactive" && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Inactive</span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {member.id === currentUserId ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(member)} className="mr-3 text-blue-600 underline">Edit</button>
                      <button type="button" onClick={() => handleDelete(member.id)} className="text-red-600 underline">Delete</button>
                    </>
                  )}
                </td>
              </tr>
              {editingId === member.id && (
                <tr>
                  <td colSpan={6} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input type="text" aria-label={`Edit name for ${member.name}`} value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
                      <input type="tel" aria-label={`Edit phone for ${member.name}`} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
                      <select aria-label={`Edit role for ${member.name}`} value={editRole} onChange={(e) => setEditRole(e.target.value as Role)} className="rounded border border-gray-300 px-2 py-1">
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                        <option value="accountant">Accountant</option>
                      </select>
                      {editRole === "teacher" && (
                        <>
                          <select aria-label={`Edit class for ${member.name}`} value={editClassId} onChange={(e) => setEditClassId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
                            <option value="">No class assignment</option>
                            {classes.map((klass) => (
                              <option key={klass.id} value={klass.id}>{klass.name} {klass.section}</option>
                            ))}
                          </select>
                          <input type="text" aria-label={`Edit subject for ${member.name}`} value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="rounded border border-gray-300 px-2 py-1" placeholder="Subject" />
                        </>
                      )}
                      <button type="button" onClick={() => handleSaveEdit(member.id)} className="rounded bg-blue-600 px-2 py-1 text-white">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded border border-gray-300 px-2 py-1">Cancel</button>
                    </div>
                  </td>
                </tr>
              )}
              {deleteBlockedId === member.id && (
                <tr>
                  <td colSpan={6} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex items-center gap-2 px-2 text-sm">
                      <span>{member.name} has recorded activity and cannot be permanently deleted.</span>
                      <button type="button" onClick={() => handleDeactivate(member.id)} className="rounded bg-amber-600 px-2 py-1 text-white">Deactivate instead</button>
                      <button type="button" onClick={() => setDeleteBlockedId(null)} className="rounded border border-gray-300 px-2 py-1">Cancel</button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] Replace `apps/web/src/app/dashboard/staff/page.tsx` with:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStaff } from "@/lib/school-setup/staff";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { StaffView } from "@/components/school-setup/StaffView";

export default async function StaffPage() {
  const claims = requireDashboardRole(["admin"]);
  const [staff, classes] = await Promise.all([
    listStaff(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Staff</h1>
      <StaffView initialStaff={staff} classes={classes} currentUserId={claims.userId} />
    </div>
  );
}
```

- [ ] Delete `apps/web/src/components/school-setup/CreateStaffForm.tsx`:

```bash
rm apps/web/src/components/school-setup/CreateStaffForm.tsx
```

- [ ] Run: `cd apps/web && npm run build`. Expected: succeeds.

- [ ] Manually verify in the browser: log in as admin, open `/dashboard/staff`, edit a teacher's class assignment, change a teacher's role to accountant and confirm the assignment clears, attempt to delete the currently-logged-in admin's own row (confirm no Edit/Delete buttons render for it), and delete/deactivate another staff member to see both paths.

- [ ] Commit:

```bash
git add apps/web/src/components/school-setup/StaffView.tsx apps/web/src/app/dashboard/staff/page.tsx
git rm apps/web/src/components/school-setup/CreateStaffForm.tsx
git commit -m "Add Edit/Delete/Deactivate UI to Staff page"
```

---

## Task 7: Students — edit, delete, deactivate (lib + routes)

**Files:**
- Modify: `apps/web/src/lib/school-setup/students.ts`
- Create: `apps/web/src/app/api/students/[id]/route.ts`
- Create: `apps/web/src/app/api/students/[id]/deactivate/route.ts`
- Modify: `apps/web/tests/students-api.test.ts`

**Interfaces produced (used by Task 8's UI):**
- `StudentSummary` gains `status: "active" | "left" | "transferred" | "graduated" | "inactive"`.
- `editStudent(prisma, { studentId, schoolId, academicYearId, fields }): Promise<EditStudentResult>`
- `deleteStudent(prisma, { studentId, schoolId }): Promise<DeleteStudentResult>`
- `deactivateStudent(prisma, { studentId, schoolId, academicYearId }): Promise<DeactivateStudentResult>`

### Step 1: Lib functions

- [ ] Replace `apps/web/src/lib/school-setup/students.ts` with:

```ts
import type { PrismaClient, StudentStatus } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  status: StudentStatus;
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}

export async function listStudents(prisma: PrismaClient, schoolId: number): Promise<StudentSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });

  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      parentLinks: { include: { parent: true } },
      enrollments: {
        where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
        include: { class: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return students.map((student) => {
    const enrollment = student.enrollments[0];
    return {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      status: student.status,
      class: enrollment ? { name: enrollment.class.name, section: enrollment.class.section } : null,
      parents: student.parentLinks.map((link) => ({ name: link.parent.name, phone: link.parent.phone })),
    };
  });
}

export type CreateStudentResult =
  | { ok: true; student: { id: number; name: string; admissionNo: string } }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PARENT_NAME_REQUIRED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function createStudent(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    parentPhone: string;
    parentName?: string;
  }
): Promise<CreateStudentResult> {
  const existingAdmission = await prisma.student.findUnique({ where: { admissionNo: input.admissionNo } });
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

  const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
  if (!targetClass) {
    return { ok: false, error: "INVALID_CLASS" };
  }

  try {
    const student = await prisma.$transaction(async (tx) => {
      const parent =
        existingParent ??
        (await tx.user.create({
          data: { schoolId, phone: input.parentPhone, name: input.parentName as string, role: "parent" },
        }));

      const createdStudent = await tx.student.create({
        data: { schoolId, name: input.name, dob: new Date(input.dob), admissionNo: input.admissionNo },
      });

      await tx.enrollment.create({
        data: { studentId: createdStudent.id, classId: input.classId, academicYearId, status: "active" },
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
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    }
    throw err;
  }
}

export type EditStudentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "NO_ACTIVE_ENROLLMENT" };

export async function editStudent(
  prisma: PrismaClient,
  params: {
    studentId: number;
    schoolId: number;
    academicYearId: number | null;
    fields: { name?: string; dob?: string; admissionNo?: string; classId?: number };
  }
): Promise<EditStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (params.fields.admissionNo && params.fields.admissionNo !== student.admissionNo) {
    const existing = await prisma.student.findUnique({ where: { admissionNo: params.fields.admissionNo } });
    if (existing) {
      return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    }
  }

  if (params.fields.classId !== undefined) {
    if (!params.academicYearId) {
      return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };
    }
    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId } },
    });
    if (!enrollment) {
      return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };
    }
    const targetClass = await prisma.class.findFirst({
      where: { id: params.fields.classId, schoolId: params.schoolId },
    });
    if (!targetClass) {
      return { ok: false, error: "INVALID_CLASS" };
    }
  }

  await prisma.$transaction(async (tx) => {
    const data: { name?: string; dob?: Date; admissionNo?: string } = {};
    if (params.fields.name !== undefined) data.name = params.fields.name;
    if (params.fields.dob !== undefined) data.dob = new Date(params.fields.dob);
    if (params.fields.admissionNo !== undefined) data.admissionNo = params.fields.admissionNo;
    if (Object.keys(data).length > 0) {
      await tx.student.update({ where: { id: params.studentId }, data });
    }

    if (params.fields.classId !== undefined && params.academicYearId) {
      await tx.enrollment.update({
        where: {
          studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId },
        },
        data: { classId: params.fields.classId },
      });
    }
  });

  return { ok: true };
}

export type DeleteStudentResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteStudent(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number }
): Promise<DeleteStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const [attendanceCount, markCount, feePaymentCount, assignmentStatusCount, promotionLogCount, enrollmentCount] =
    await Promise.all([
      prisma.attendance.count({ where: { studentId: params.studentId } }),
      prisma.mark.count({ where: { studentId: params.studentId } }),
      prisma.feePayment.count({ where: { studentId: params.studentId } }),
      prisma.assignmentStatus.count({ where: { studentId: params.studentId } }),
      prisma.promotionLogEntry.count({ where: { studentId: params.studentId } }),
      prisma.enrollment.count({ where: { studentId: params.studentId } }),
    ]);

  const hasHistory =
    attendanceCount + markCount + feePaymentCount + assignmentStatusCount + promotionLogCount > 0 ||
    enrollmentCount > 1;
  if (hasHistory) {
    return { ok: false, error: "HAS_HISTORY" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.deleteMany({ where: { studentId: params.studentId } });
    await tx.parentStudent.deleteMany({ where: { studentId: params.studentId } });
    await tx.student.delete({ where: { id: params.studentId } });
  });

  return { ok: true, deleted: true };
}

export type DeactivateStudentResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function deactivateStudent(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number; academicYearId: number | null }
): Promise<DeactivateStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) {
    return { ok: false, error: "NOT_FOUND" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: params.studentId }, data: { status: "inactive" } });
    if (params.academicYearId) {
      await tx.enrollment.updateMany({
        where: { studentId: params.studentId, academicYearId: params.academicYearId },
        data: { status: "inactive" },
      });
    }
  });

  return { ok: true };
}
```

- [ ] `listStudents` now returns `status` — the existing tests in `apps/web/tests/students-api.test.ts` only assert specific fields via `.find(...)` lookups and don't do an exact `toEqual` on the full list shape, so **no test changes needed** for this step; confirm by re-reading the file before moving on (it was already read in full during planning — none of its assertions break).

- [ ] Run: `cd apps/web && npx vitest run tests/students-api.test.ts`. Expected: still passes unchanged.

- [ ] Commit: `git add apps/web/src/lib/school-setup/students.ts && git commit -m "Add editStudent/deleteStudent/deactivateStudent"`

### Step 2: Routes and tests

- [ ] Create `apps/web/src/app/api/students/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { editStudent, deleteStudent } from "@/lib/school-setup/students";
import { getActiveAcademicYear } from "@/lib/academic-years";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const studentId = Number(params.id);
    if (Number.isNaN(studentId)) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    let body: { name?: string; dob?: string; admissionNo?: string; classId?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);

    const result = await editStudent(prisma, {
      studentId,
      schoolId: claims.schoolId,
      academicYearId: activeYear?.id ?? null,
      fields: body,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Student not found" }, { status: 404 });
      }
      if (result.error === "DUPLICATE_ADMISSION_NO") {
        return NextResponse.json(
          { error: "A student with this admission number already exists" },
          { status: 409 }
        );
      }
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      return NextResponse.json(
        { error: "This student has no active enrollment to reassign" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const studentId = Number(params.id);
    if (Number.isNaN(studentId)) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const result = await deleteStudent(prisma, { studentId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Student not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "This student has recorded history and cannot be deleted", deletable: false },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Create `apps/web/src/app/api/students/[id]/deactivate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { deactivateStudent } from "@/lib/school-setup/students";
import { getActiveAcademicYear } from "@/lib/academic-years";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const studentId = Number(params.id);
    if (Number.isNaN(studentId)) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);

    const result = await deactivateStudent(prisma, {
      studentId,
      schoolId: claims.schoolId,
      academicYearId: activeYear?.id ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] Add a new `describe` block to `apps/web/tests/students-api.test.ts` (add `import { PATCH as patchStudent, DELETE as deleteStudentRoute } from "../src/app/api/students/[id]/route";` and `import { PATCH as deactivateStudentRoute } from "../src/app/api/students/[id]/deactivate/route";` — `createActiveYear`/`createEnrolledStudent` are already imported in this file):

```ts
describe("/api/students/[id]", () => {
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
      data: { phone: "+15551110030", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("edits name, dob, and admission number", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Original Name",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-1",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Name", admissionNo: "SCH-EDIT-1B" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updated).toMatchObject({ name: "Updated Name", admissionNo: "SCH-EDIT-1B" });
  });

  it("reassigns the student's active-year enrollment to a different class", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const gradeA = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const gradeB = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "B" } });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: gradeA.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-2",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ classId: gradeB.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(200);

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    });
    expect(enrollment?.classId).toBe(gradeB.id);
  });

  it("rejects a duplicate admission number on edit with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Existing",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-TAKEN",
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Other",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-3",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ admissionNo: "SCH-TAKEN" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(409);
  });

  it("deletes a student with zero recorded history", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Fresh Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-DEL-1",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, { method: "DELETE" });
    const response = await deleteStudentRoute(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(200);

    const found = await prisma.student.findUnique({ where: { id: student.id } });
    expect(found).toBeNull();
  });

  it("rejects deleting a student with recorded history, offering deactivate", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15559991099", role: "teacher", name: "A Teacher", schoolId: school.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "History Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-DEL-2",
    });
    await prisma.attendance.create({
      data: { studentId: student.id, date: new Date("2026-07-01"), status: "present", markedById: teacher.id },
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, { method: "DELETE" });
    const response = await deleteStudentRoute(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.deletable).toBe(false);
  });

  it("deactivates a student and their active-year enrollment", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "To Deactivate",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-DEACT-1",
    });

    const request = new Request(`http://localhost/api/students/${student.id}/deactivate`, { method: "PATCH" });
    const response = await deactivateStudentRoute(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(200);

    const updatedStudent = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updatedStudent?.status).toBe("inactive");
    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    });
    expect(enrollment?.status).toBe("inactive");
  });

  it("returns 404 for a cross-school student id", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await prisma.class.create({ data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" } });
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: otherSchool.id,
      classId: otherClass.id,
      academicYearId: otherYear.id,
      name: "Cross Tenant",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-CROSS-1",
    });

    const request = new Request(`http://localhost/api/students/${otherStudent.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Hijack" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(otherStudent.id) } });
    expect(response.status).toBe(404);
  });
});
```

- [ ] Run: `cd apps/web && npx vitest run tests/students-api.test.ts`. Expected: all pass.

- [ ] Commit:

```bash
git add apps/web/src/app/api/students apps/web/tests/students-api.test.ts
git commit -m "Add Student edit/delete/deactivate API routes"
```

---

## Task 8: Students — UI (StudentsView)

**Files:**
- Create: `apps/web/src/components/school-setup/StudentsView.tsx`
- Modify: `apps/web/src/app/dashboard/students/page.tsx`
- Delete: `apps/web/src/components/school-setup/CreateStudentForm.tsx`

**Interfaces consumed:** `GET/POST /api/students`, `PATCH/DELETE /api/students/:id`, `PATCH /api/students/:id/deactivate` (Task 7).

- [ ] Create `apps/web/src/components/school-setup/StudentsView.tsx`:

```tsx
"use client";

import { Fragment, useState } from "react";

interface StudentRow {
  id: number;
  name: string;
  admissionNo: string;
  status: "active" | "left" | "transferred" | "graduated" | "inactive";
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}

export function StudentsView({
  initialStudents,
  classes,
  isAdmin,
}: {
  initialStudents: StudentRow[];
  classes: { id: number; name: string; section: string }[];
  isAdmin: boolean;
}) {
  const [students, setStudents] = useState(initialStudents);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [admissionNo, setAdmissionNo] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editAdmissionNo, setEditAdmissionNo] = useState("");
  const [editClassId, setEditClassId] = useState("");
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/students");
    setStudents(await response.json());
  }

  async function handleCreate() {
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
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(student: StudentRow) {
    setEditingId(student.id);
    setEditName(student.name);
    setEditAdmissionNo(student.admissionNo);
    setEditDob("");
    setEditClassId("");
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);
    const body: { name: string; admissionNo: string; dob?: string; classId?: number } = {
      name: editName,
      admissionNo: editAdmissionNo,
    };
    if (editDob) body.dob = editDob;
    if (editClassId) body.classId = Number(editClassId);

    const response = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/students/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleteBlockedId(null);
      await refresh();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(id);
      return;
    }
    setError(body.error);
  }

  async function handleDeactivate(id: number) {
    setError(null);
    const response = await fetch(`/api/students/${id}/deactivate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setDeleteBlockedId(null);
    await refresh();
  }

  return (
    <div className="mt-4">
      {isAdmin && (
        <div className="flex flex-col gap-2">
          <input type="text" aria-label="Student name" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-300 px-3 py-2" placeholder="Student name" />
          <input type="date" aria-label="Date of birth" value={dob} onChange={(e) => setDob(e.target.value)} className="rounded border border-gray-300 px-3 py-2" />
          <select aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded border border-gray-300 px-3 py-2">
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>{klass.name} {klass.section}</option>
            ))}
          </select>
          <input type="text" aria-label="Admission number" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} className="rounded border border-gray-300 px-3 py-2" placeholder="Admission number" />
          <input type="tel" aria-label="Parent phone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className="rounded border border-gray-300 px-3 py-2" placeholder="Parent phone number" />
          <input type="text" aria-label="Parent name" value={parentName} onChange={(e) => setParentName(e.target.value)} className="rounded border border-gray-300 px-3 py-2" placeholder="Parent name (only if this phone is new)" />
          <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">Create Student</button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Admission No.</th>
            <th className="border-b border-gray-200 pb-2">Class</th>
            <th className="border-b border-gray-200 pb-2">Parent(s)</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            {isAdmin && <th className="border-b border-gray-200 pb-2">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <Fragment key={student.id}>
              <tr>
                <td className="border-b border-gray-100 py-2">{student.name}</td>
                <td className="border-b border-gray-100 py-2">{student.admissionNo}</td>
                <td className="border-b border-gray-100 py-2">
                  {student.class ? `${student.class.name} ${student.class.section}` : "—"}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {student.parents.map((parent) => `${parent.name} (${parent.phone})`).join(", ") || "—"}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {student.status !== "active" && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">{student.status}</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="border-b border-gray-100 py-2">
                    <button type="button" onClick={() => startEdit(student)} className="mr-3 text-blue-600 underline">Edit</button>
                    <button type="button" onClick={() => handleDelete(student.id)} className="text-red-600 underline">Delete</button>
                  </td>
                )}
              </tr>
              {editingId === student.id && (
                <tr>
                  <td colSpan={6} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input type="text" aria-label={`Edit name for ${student.name}`} value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
                      <input type="date" aria-label={`Edit date of birth for ${student.name}`} value={editDob} onChange={(e) => setEditDob(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
                      <input type="text" aria-label={`Edit admission number for ${student.name}`} value={editAdmissionNo} onChange={(e) => setEditAdmissionNo(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
                      {student.class && (
                        <select aria-label={`Edit class for ${student.name}`} value={editClassId} onChange={(e) => setEditClassId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
                          <option value="">Keep current class</option>
                          {classes.map((klass) => (
                            <option key={klass.id} value={klass.id}>{klass.name} {klass.section}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" onClick={() => handleSaveEdit(student.id)} className="rounded bg-blue-600 px-2 py-1 text-white">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded border border-gray-300 px-2 py-1">Cancel</button>
                    </div>
                  </td>
                </tr>
              )}
              {deleteBlockedId === student.id && (
                <tr>
                  <td colSpan={6} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex items-center gap-2 px-2 text-sm">
                      <span>{student.name} has recorded history and cannot be permanently deleted.</span>
                      <button type="button" onClick={() => handleDeactivate(student.id)} className="rounded bg-amber-600 px-2 py-1 text-white">Deactivate instead</button>
                      <button type="button" onClick={() => setDeleteBlockedId(null)} className="rounded border border-gray-300 px-2 py-1">Cancel</button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] Replace `apps/web/src/app/dashboard/students/page.tsx` with:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStudents } from "@/lib/school-setup/students";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { StudentsView } from "@/components/school-setup/StudentsView";

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
      <StudentsView initialStudents={students} classes={classes} isAdmin={isAdmin} />
    </div>
  );
}
```

- [ ] Delete `apps/web/src/components/school-setup/CreateStudentForm.tsx`:

```bash
rm apps/web/src/components/school-setup/CreateStudentForm.tsx
```

- [ ] Note: `/dashboard/students` is also reachable by `teacher` role (read-only per the existing `requireDashboardRole(["teacher", "admin"])`); `GET /api/students` itself is `requireApiRole(["admin"])`-only per the existing route, so a teacher's `StudentsView` calling `refresh()` after a (nonexistent, since `isAdmin` hides the buttons) mutation isn't a concern — but the initial `initialStudents` prop for a teacher comes from the server-rendered page's own `listStudents` call, not a client fetch, so teachers still see the roster correctly without ever hitting the admin-only API route. No route change needed here.

- [ ] Run: `cd apps/web && npm run build`. Expected: succeeds.

- [ ] Manually verify in the browser: log in as admin, open `/dashboard/students`, edit a student's name/admission number, reassign their class, attempt to delete a student with attendance history (confirm "Deactivate instead" appears and works), then delete a freshly-created student with no history (confirm it disappears). Log in as a teacher and confirm the Students page still renders the roster with no Edit/Delete/Create controls.

- [ ] Commit:

```bash
git add apps/web/src/components/school-setup/StudentsView.tsx apps/web/src/app/dashboard/students/page.tsx
git rm apps/web/src/components/school-setup/CreateStudentForm.tsx
git commit -m "Add Edit/Delete/Deactivate UI to Students page"
```

---

## Task 9: Final verification

- [ ] Run the full test suite: `cd apps/web && npm test`. Expected: every test file passes.
- [ ] Run a production build: `cd apps/web && npm run build`. Expected: succeeds with no TypeScript errors.
- [ ] Confirm no remaining imports of the deleted `CreateClassForm`/`CreateStaffForm`/`CreateStudentForm` components anywhere: `grep -rn "CreateClassForm\|CreateStaffForm\|CreateStudentForm" apps/web/src apps/web/tests` should return nothing.
- [ ] Manually smoke-test the full golden path in a browser (via `preview_start`/`preview_click`/`preview_console_logs`): as admin, edit and delete/deactivate one row on each of Classes, Staff, and Students, and confirm a deactivated staff member can no longer log in (via `send-otp` returning the "not registered"-style error for their phone).
- [ ] Commit any final fixes discovered during manual testing with a clear message.
