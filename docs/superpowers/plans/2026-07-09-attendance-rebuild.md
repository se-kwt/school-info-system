# Attendance Rebuild (Card UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the table-based teacher attendance flow with a card-based UI (photo, name, roll number, click-to-cycle status, bulk actions, review-before-submit), and add the `rollNumber`/`photoUrl` student data (plus a minimal upload/edit path) that the cards depend on.

**Architecture:** Next.js 14 App Router, following this codebase's existing pattern of `lib/<feature>.ts` business logic + thin `app/api/<feature>/route.ts` handlers + a page → client "View" component → presentational sub-components. Prisma/PostgreSQL for persistence, Vitest for tests (real seeded Postgres for API-level tests, jsdom + Testing Library for component tests).

**Tech Stack:** Next.js 14, React 18, Prisma 5, PostgreSQL, Tailwind CSS v3, Vitest, @testing-library/react.

## Global Constraints

- `rollNumber` is required, manually entered, unique **within a class** (`@@unique([classId, rollNumber])`) — not globally unique.
- `photoUrl` is nullable; cards fall back to an initials avatar when absent.
- Photo storage is local disk under `apps/web/public/uploads/students/` — no external object storage.
- Upload accepts only `image/png`, `image/jpeg`, `image/webp`, max 2MB.
- The `late` attendance status is kept as a fully equivalent third markable state (cycle order: `null → present → absent → late → null`).
- Admin's read-only view, per-student notes, and month% column are dropped from the rebuilt component entirely (not redesigned here).
- No note field in the new submit payload.
- Reference spec: [docs/superpowers/specs/2026-07-09-attendance-rebuild-design.md](../specs/2026-07-09-attendance-rebuild-design.md).

---

### Task 1: Add `rollNumber`/`photoUrl` to Student and keep student creation working

This is one task because the schema change and the code that writes to it can't be reviewed independently — a non-null column with no default breaks every existing `Student` creation path (lib function, API route, form, and every test that seeds a student) until all of them are updated together.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`Student` model)
- Create: new Prisma migration (via CLI, path decided by Prisma)
- Modify: `apps/web/src/lib/school-setup/prisma-errors.ts`
- Modify: `apps/web/src/lib/school-setup/students.ts`
- Modify: `apps/web/src/app/api/students/route.ts`
- Modify: `apps/web/src/components/school-setup/CreateStudentForm.tsx`
- Modify: `apps/web/prisma/fixtures.ts`
- Modify: `apps/web/tests/dashboard-overview.test.ts`
- Modify: `apps/web/tests/marks-api.test.ts`
- Modify: `apps/web/tests/attendance-api.test.ts`
- Modify: `apps/web/tests/students-api.test.ts`
- Test (new cases): `apps/web/tests/students-api.test.ts`

**Interfaces:**
- Produces: `CreateStudentResult` gains `{ ok: false; error: "DUPLICATE_ROLL_NUMBER" }`. `createStudent(prisma, schoolId, input)` now requires `input.rollNumber: string` and accepts optional `input.photoUrl?: string`. `uniqueConstraintTarget(err: unknown): string[] | undefined` exported from `prisma-errors.ts`.

- [ ] **Step 1: Edit the Prisma schema**

In `apps/web/prisma/schema.prisma`, replace the `Student` model:

```prisma
model Student {
  id          Int      @id @default(autoincrement())
  school      School   @relation(fields: [schoolId], references: [id])
  schoolId    Int
  name        String
  dob         DateTime
  class       Class    @relation(fields: [classId], references: [id])
  classId     Int
  section     String
  admissionNo String   @unique
  rollNumber  String
  photoUrl    String?

  parentLinks        ParentStudent[]
  attendance         Attendance[]
  assignmentStatuses AssignmentStatus[]
  marks              Mark[]
  feePayments        FeePayment[]

  @@unique([classId, rollNumber])
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd apps/web && npx prisma migrate dev --name student_roll_number_and_photo`
Expected: Prisma creates a new directory under `apps/web/prisma/migrations/`, prints "Your database is now in sync with your schema", and regenerates the Prisma client. If it reports existing rows would violate the new required `rollNumber` column, that's fine here — this is a fresh dev/test database with no student rows carried over between resets (`resetDb()` truncates `Student` in every test's `beforeEach`).

Then apply the same migration to the test database:

Run: `npm run prisma:migrate:test`
Expected: "The following migration(s) have been applied" listing the new migration, no errors.

- [ ] **Step 3: Update `prisma-errors.ts` to expose the violated constraint's target columns**

Replace the full contents of `apps/web/src/lib/school-setup/prisma-errors.ts`:

```ts
import { Prisma } from "@prisma/client";

export function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export function uniqueConstraintTarget(err: unknown): string[] | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return err.meta?.target as string[] | undefined;
  }
  return undefined;
}
```

- [ ] **Step 4: Update `createStudent` to accept and validate `rollNumber`/`photoUrl`**

Replace the full contents of `apps/web/src/lib/school-setup/students.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { isUniqueConstraintViolation, uniqueConstraintTarget } from "./prisma-errors";

export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  rollNumber: string;
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
    rollNumber: student.rollNumber,
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
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PARENT_NAME_REQUIRED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function createStudent(
  prisma: PrismaClient,
  schoolId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    rollNumber: string;
    photoUrl?: string;
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

  const existingRollNumber = await prisma.student.findFirst({
    where: { classId: input.classId, rollNumber: input.rollNumber },
  });
  if (existingRollNumber) {
    return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
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
        data: {
          schoolId,
          name: input.name,
          dob: new Date(input.dob),
          classId: input.classId,
          section: targetClass.section,
          admissionNo: input.admissionNo,
          rollNumber: input.rollNumber,
          photoUrl: input.photoUrl ?? null,
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
  } catch (err) {
    const target = uniqueConstraintTarget(err);
    if (target?.includes("rollNumber")) {
      return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    }
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    }
    throw err;
  }
}
```

- [ ] **Step 5: Update `POST /api/students` to require `rollNumber` and pass through `photoUrl`**

Replace the full contents of `apps/web/src/app/api/students/route.ts`:

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
    let rollNumber: string | undefined;
    let photoUrl: string | undefined;
    let parentPhone: string | undefined;
    let parentName: string | undefined;
    try {
      ({ name, dob, classId, admissionNo, rollNumber, photoUrl, parentPhone, parentName } =
        await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !dob || !classId || !admissionNo || !rollNumber || !parentPhone) {
      return NextResponse.json(
        { error: "name, dob, classId, admissionNo, rollNumber, and parentPhone are required" },
        { status: 400 }
      );
    }

    const result = await createStudent(prisma, claims.schoolId, {
      name,
      dob,
      classId,
      admissionNo,
      rollNumber,
      photoUrl,
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
      if (result.error === "DUPLICATE_ROLL_NUMBER") {
        return NextResponse.json(
          { error: "A student with this roll number already exists in this class" },
          { status: 409 }
        );
      }
      if (result.error === "PHONE_WRONG_ROLE") {
        return NextResponse.json(
          { error: "This phone number is already registered as a different role" },
          { status: 409 }
        );
      }
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
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

- [ ] **Step 6: Add a roll number field to `CreateStudentForm`**

Replace the full contents of `apps/web/src/components/school-setup/CreateStudentForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

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
  const [rollNumber, setRollNumber] = useState("");
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
        rollNumber,
        parentPhone,
        parentName: parentName || undefined,
      }),
    });

    if (response.status === 201) {
      setName("");
      setDob("");
      setAdmissionNo("");
      setRollNumber("");
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        type="text"
        aria-label="Student name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={inputClass}
        placeholder="Student name"
      />
      <input
        type="date"
        aria-label="Date of birth"
        value={dob}
        onChange={(event) => setDob(event.target.value)}
        className={inputClass}
      />
      <select
        aria-label="Class"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        className={inputClass}
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
        className={inputClass}
        placeholder="Admission number"
      />
      <input
        type="text"
        aria-label="Roll number"
        value={rollNumber}
        onChange={(event) => setRollNumber(event.target.value)}
        className={inputClass}
        placeholder="Roll number"
      />
      <input
        type="tel"
        aria-label="Parent phone"
        value={parentPhone}
        onChange={(event) => setParentPhone(event.target.value)}
        className={inputClass}
        placeholder="Parent phone number"
      />
      <input
        type="text"
        aria-label="Parent name"
        value={parentName}
        onChange={(event) => setParentName(event.target.value)}
        className={inputClass}
        placeholder="Parent name (only if this phone is new)"
      />
      <button
        type="submit"
        className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
      >
        Create Student
      </button>
      {error && <p className="w-full text-xs text-red-500">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 7: Backfill `rollNumber` in `apps/web/prisma/fixtures.ts`**

In `apps/web/prisma/fixtures.ts`, change:

```ts
  const student = await prisma.student.create({
    data: {
      schoolId: school.id,
      name: "Rohan Sharma",
      dob: new Date("2015-04-12"),
      classId: classA.id,
      section: "A",
      admissionNo: "GH-2026-001",
    },
  });
```

to:

```ts
  const student = await prisma.student.create({
    data: {
      schoolId: school.id,
      name: "Rohan Sharma",
      dob: new Date("2015-04-12"),
      classId: classA.id,
      section: "A",
      admissionNo: "GH-2026-001",
      rollNumber: "GH-2026-001",
    },
  });
```

- [ ] **Step 8: Backfill `rollNumber` in `apps/web/tests/dashboard-overview.test.ts`**

There are four `prisma.student.create` calls with `admissionNo`. Add a matching `rollNumber` line right after each:

Occurrence 1 (first "scopes a teacher's overview" test, `otherClass`):
```ts
        classId: otherClass.id,
        section: "B",
        admissionNo: "GH-2026-002",
```
→
```ts
        classId: otherClass.id,
        section: "B",
        admissionNo: "GH-2026-002",
        rollNumber: "GH-2026-002",
```
This exact snippet appears twice (the teacher-scope test and the admin-scope test) — apply to both occurrences.

Occurrence 2 (studentB, `fixtures.classA.id`):
```ts
        classId: fixtures.classA.id,
        section: "A",
        admissionNo: "GH-2026-010",
```
→
```ts
        classId: fixtures.classA.id,
        section: "A",
        admissionNo: "GH-2026-010",
        rollNumber: "GH-2026-010",
```

Occurrence 3 (studentC, `fixtures.classA.id`):
```ts
        classId: fixtures.classA.id,
        section: "A",
        admissionNo: "GH-2026-011",
```
→
```ts
        classId: fixtures.classA.id,
        section: "A",
        admissionNo: "GH-2026-011",
        rollNumber: "GH-2026-011",
```

- [ ] **Step 9: Backfill `rollNumber` in `apps/web/tests/marks-api.test.ts`**

Four occurrences. Add a `rollNumber` line right after each `admissionNo` line:

```ts
        admissionNo: "SCH-700",
```
→
```ts
        admissionNo: "SCH-700",
        rollNumber: "SCH-700",
```

```ts
        admissionNo: "SCH-800",
```
→
```ts
        admissionNo: "SCH-800",
        rollNumber: "SCH-800",
```

```ts
        admissionNo: "SCH-801",
```
→
```ts
        admissionNo: "SCH-801",
        rollNumber: "SCH-801",
```

```ts
          admissionNo: `SCH-90${index}`,
```
→
```ts
          admissionNo: `SCH-90${index}`,
          rollNumber: `SCH-90${index}`,
```
(note the extra indentation on this one — it's inside the `for...of` loop block)

- [ ] **Step 10: Backfill `rollNumber` in `apps/web/tests/attendance-api.test.ts`**

Two occurrences:

```ts
        admissionNo: "SCH-500",
```
→
```ts
        admissionNo: "SCH-500",
        rollNumber: "1",
```

```ts
        admissionNo: "SCH-501",
```
→
```ts
        admissionNo: "SCH-501",
        rollNumber: "1",
```

- [ ] **Step 11: Backfill `rollNumber` in `apps/web/tests/fee-payments-api.test.ts`**

Three occurrences:

```ts
        admissionNo: "SCH-900",
```
→
```ts
        admissionNo: "SCH-900",
        rollNumber: "SCH-900",
```

```ts
        admissionNo: "SCH-901",
```
→
```ts
        admissionNo: "SCH-901",
        rollNumber: "SCH-901",
```

```ts
        admissionNo: "SCH-902",
```
→
```ts
        admissionNo: "SCH-902",
        rollNumber: "SCH-902",
```

- [ ] **Step 12: Backfill `rollNumber` in `apps/web/tests/assignments-api.test.ts`**

Five occurrences:

```ts
        admissionNo: "SCH-500",
```
→
```ts
        admissionNo: "SCH-500",
        rollNumber: "SCH-500",
```

```ts
        admissionNo: "SCH-501",
```
→
```ts
        admissionNo: "SCH-501",
        rollNumber: "SCH-501",
```

```ts
        admissionNo: "SCH-600",
```
→
```ts
        admissionNo: "SCH-600",
        rollNumber: "SCH-600",
```

```ts
        admissionNo: "SCH-601",
```
→
```ts
        admissionNo: "SCH-601",
        rollNumber: "SCH-601",
```

```ts
        admissionNo: "SCH-602",
```
→
```ts
        admissionNo: "SCH-602",
        rollNumber: "SCH-602",
```

- [ ] **Step 13: Update `apps/web/tests/students-api.test.ts` — add `rollNumber` to every POST body and the one direct `prisma.student.create`**

Test 1 ("creates a student linked to an existing parent"), change the POST body:
```ts
      body: JSON.stringify({
        name: "New Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-001",
        parentPhone: parent.phone,
      }),
```
→
```ts
      body: JSON.stringify({
        name: "New Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-001",
        rollNumber: "1",
        parentPhone: parent.phone,
      }),
```

Test 2 ("creates a student and a new parent in one request"):
```ts
      body: JSON.stringify({
        name: "Another Student",
        dob: "2015-06-15",
        classId: klass.id,
        admissionNo: "SCH-002",
        parentPhone: "+15558880002",
        parentName: "Brand New Parent",
      }),
```
→
```ts
      body: JSON.stringify({
        name: "Another Student",
        dob: "2015-06-15",
        classId: klass.id,
        admissionNo: "SCH-002",
        rollNumber: "1",
        parentPhone: "+15558880002",
        parentName: "Brand New Parent",
      }),
```

Test 3 ("rejects a duplicate admission number with 409") — both the seeded student and the POST body:
```ts
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
```
→
```ts
    await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Existing Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: klass.section,
        admissionNo: "SCH-003",
        rollNumber: "1",
      },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Duplicate",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-003",
        rollNumber: "2",
        parentPhone: "+15558880003",
        parentName: "Some Parent",
      }),
```

Test 4 ("rejects a parentPhone belonging to a non-parent role with 409"):
```ts
      body: JSON.stringify({
        name: "Blocked Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-004",
        parentPhone: teacher.phone,
      }),
```
→
```ts
      body: JSON.stringify({
        name: "Blocked Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-004",
        rollNumber: "1",
        parentPhone: teacher.phone,
      }),
```

Test 5 ("rejects a new parentPhone with no parentName with 400"):
```ts
      body: JSON.stringify({
        name: "No Parent Name",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-005",
        parentPhone: "+15558880005",
      }),
```
→
```ts
      body: JSON.stringify({
        name: "No Parent Name",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-005",
        rollNumber: "1",
        parentPhone: "+15558880005",
      }),
```

Test 6 ("rejects a classId belonging to a different school with 400"):
```ts
      body: JSON.stringify({
        name: "Cross Tenant",
        dob: "2016-01-01",
        classId: otherClass.id,
        admissionNo: "SCH-999",
        parentPhone: "+15558889999",
        parentName: "Some Parent",
      }),
```
→
```ts
      body: JSON.stringify({
        name: "Cross Tenant",
        dob: "2016-01-01",
        classId: otherClass.id,
        admissionNo: "SCH-999",
        rollNumber: "1",
        parentPhone: "+15558889999",
        parentName: "Some Parent",
      }),
```

- [ ] **Step 14: Add new test cases for the `rollNumber` requirement and uniqueness**

Append to `apps/web/tests/students-api.test.ts`, inside the existing `describe("/api/students", ...)` block (add before the final closing `});`):

```ts
  it("rejects a missing rollNumber with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 8", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "No Roll Number",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-006",
        parentPhone: "+15558880006",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects a duplicate rollNumber within the same class with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });
    await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "First Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-007",
        rollNumber: "5",
      },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Second Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-008",
        rollNumber: "5",
        parentPhone: "+15558880007",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("allows the same rollNumber in two different classes", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const classOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 10", section: "A" },
    });
    const classTwo = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 11", section: "A" },
    });
    await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "First Student",
        dob: new Date("2016-01-01"),
        classId: classOne.id,
        section: "A",
        admissionNo: "SCH-009",
        rollNumber: "5",
      },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Second Student",
        dob: "2016-01-01",
        classId: classTwo.id,
        admissionNo: "SCH-010",
        rollNumber: "5",
        parentPhone: "+15558880008",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);
  });
```

- [ ] **Step 15: Run the full test suite**

Run: `cd apps/web && npm test`
Expected: all test files pass, including the newly added and backfilled ones. If any test fails with a Prisma "Argument rollNumber is missing" error, find the remaining unmigrated `prisma.student.create` call from the grep list above and add `rollNumber`.

- [ ] **Step 16: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations apps/web/prisma/fixtures.ts \
  apps/web/src/lib/school-setup/prisma-errors.ts apps/web/src/lib/school-setup/students.ts \
  apps/web/src/app/api/students/route.ts apps/web/src/components/school-setup/CreateStudentForm.tsx \
  apps/web/tests/dashboard-overview.test.ts apps/web/tests/marks-api.test.ts \
  apps/web/tests/attendance-api.test.ts apps/web/tests/students-api.test.ts \
  apps/web/tests/fee-payments-api.test.ts apps/web/tests/assignments-api.test.ts
git commit -m "feat: add rollNumber and photoUrl to Student"
```

---

### Task 2: Photo upload endpoint

**Files:**
- Create: `apps/web/src/app/api/students/upload-photo/route.ts`
- Test: `apps/web/tests/students-upload-photo-api.test.ts`
- Modify: `apps/web/.gitignore`

**Interfaces:**
- Consumes: `requireApiRole` from `@/lib/auth/require-api-role`, `AuthError` from `@/lib/auth/rbac` (both already exist).
- Produces: `POST /api/students/upload-photo` accepting `multipart/form-data` with a `file` field, returning `200 { photoUrl: string }` on success. Later tasks (CreateStudentForm, EditStudentForm) call this endpoint.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/students-upload-photo-api.test.ts`:

```ts
import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { readFile, rm } from "fs/promises";
import path from "path";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { POST as postUploadPhoto } from "../src/app/api/students/upload-photo/route";

describe("/api/students/upload-photo", () => {
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "students");

  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterEach(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15559990001", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("saves a valid PNG upload and returns a photoUrl under /uploads/students/", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "photo.png", { type: "image/png" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/students/upload-photo", {
      method: "POST",
      body: formData,
    });
    const response = await postUploadPhoto(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.photoUrl).toMatch(/^\/uploads\/students\/[\w-]+\.png$/);

    const savedBytes = await readFile(path.join(process.cwd(), "public", body.photoUrl));
    expect(savedBytes.length).toBe(4);
  });

  it("rejects a non-image content type with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], "notes.txt", { type: "text/plain" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/students/upload-photo", {
      method: "POST",
      body: formData,
    });
    const response = await postUploadPhoto(request);
    expect(response.status).toBe(400);
  });

  it("rejects a file over the 2MB size limit with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const formData = new FormData();
    const oversized = new Uint8Array(2 * 1024 * 1024 + 1);
    const file = new File([oversized], "big.png", { type: "image/png" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/students/upload-photo", {
      method: "POST",
      body: formData,
    });
    const response = await postUploadPhoto(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher (non-admin) with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15559990002", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/students/upload-photo", {
      method: "POST",
      body: formData,
    });
    const response = await postUploadPhoto(request);
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/students-upload-photo-api.test.ts`
Expected: FAIL — the route file doesn't exist yet (`Cannot find module '../src/app/api/students/upload-photo/route'`).

- [ ] **Step 3: Implement the upload route**

Create `apps/web/src/app/api/students/upload-photo/route.ts`:

```ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    requireApiRole(["admin"]);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: "Only PNG, JPEG, and WebP images are allowed" },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Image must be 2MB or smaller" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "students");
    await mkdir(uploadsDir, { recursive: true });

    const filename = `${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({ photoUrl: `/uploads/students/${filename}` });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/students-upload-photo-api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Ignore uploaded files in git**

Add a line to `apps/web/.gitignore`:

```
public/uploads/
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/students/upload-photo/route.ts apps/web/tests/students-upload-photo-api.test.ts apps/web/.gitignore
git commit -m "feat: add student photo upload endpoint"
```

---

### Task 3: Wire photo upload into `CreateStudentForm`

**Files:**
- Modify: `apps/web/src/components/school-setup/CreateStudentForm.tsx`
- Test: `apps/web/tests/create-student-form.test.tsx` (new)

**Interfaces:**
- Consumes: `POST /api/students/upload-photo` (Task 2) returning `{ photoUrl: string }`; `POST /api/students` (Task 1) accepting optional `photoUrl` in its JSON body.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/create-student-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CreateStudentForm } from "../src/components/school-setup/CreateStudentForm";

describe("CreateStudentForm photo upload", () => {
  afterEach(() => cleanup());

  it("uploads the selected photo first, then includes the returned photoUrl in the create request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ photoUrl: "/uploads/students/abc.png" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, name: "New Student", admissionNo: "SCH-100" }), {
          status: 201,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateStudentForm classes={[{ id: 1, name: "Grade 5", section: "A" }]} />);

    await userEvent.type(screen.getByLabelText("Student name"), "New Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-100");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Student photo"), file);

    await userEvent.click(screen.getByRole("button", { name: "Create Student" }));

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/students/upload-photo", expect.objectContaining({ method: "POST" }));
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.photoUrl).toBe("/uploads/students/abc.png");
  });

  it("creates the student without calling the upload endpoint when no photo is chosen", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, name: "New Student", admissionNo: "SCH-101" }), {
        status: 201,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateStudentForm classes={[{ id: 1, name: "Grade 5", section: "A" }]} />);

    await userEvent.type(screen.getByLabelText("Student name"), "New Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-101");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009998");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");

    await userEvent.click(screen.getByRole("button", { name: "Create Student" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/students", expect.objectContaining({ method: "POST" }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/create-student-form.test.tsx`
Expected: FAIL — no element with label "Student photo" exists yet.

- [ ] **Step 3: Add the file input and upload wiring**

Replace the full contents of `apps/web/src/components/school-setup/CreateStudentForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

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
  const [rollNumber, setRollNumber] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let photoUrl: string | undefined;
    if (photo) {
      const formData = new FormData();
      formData.append("file", photo);
      const uploadResponse = await fetch("/api/students/upload-photo", {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) {
        const body = await uploadResponse.json();
        setError(body.error);
        return;
      }
      const uploadBody = await uploadResponse.json();
      photoUrl = uploadBody.photoUrl;
    }

    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        dob,
        classId: classId ? Number(classId) : undefined,
        admissionNo,
        rollNumber,
        photoUrl,
        parentPhone,
        parentName: parentName || undefined,
      }),
    });

    if (response.status === 201) {
      setName("");
      setDob("");
      setAdmissionNo("");
      setRollNumber("");
      setPhoto(null);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        type="text"
        aria-label="Student name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={inputClass}
        placeholder="Student name"
      />
      <input
        type="date"
        aria-label="Date of birth"
        value={dob}
        onChange={(event) => setDob(event.target.value)}
        className={inputClass}
      />
      <select
        aria-label="Class"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        className={inputClass}
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
        className={inputClass}
        placeholder="Admission number"
      />
      <input
        type="text"
        aria-label="Roll number"
        value={rollNumber}
        onChange={(event) => setRollNumber(event.target.value)}
        className={inputClass}
        placeholder="Roll number"
      />
      <input
        type="file"
        aria-label="Student photo"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
        className={inputClass}
      />
      <input
        type="tel"
        aria-label="Parent phone"
        value={parentPhone}
        onChange={(event) => setParentPhone(event.target.value)}
        className={inputClass}
        placeholder="Parent phone number"
      />
      <input
        type="text"
        aria-label="Parent name"
        value={parentName}
        onChange={(event) => setParentName(event.target.value)}
        className={inputClass}
        placeholder="Parent name (only if this phone is new)"
      />
      <button
        type="submit"
        className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
      >
        Create Student
      </button>
      {error && <p className="w-full text-xs text-red-500">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/create-student-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `cd apps/web && npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/school-setup/CreateStudentForm.tsx apps/web/tests/create-student-form.test.tsx
git commit -m "feat: add photo upload to the create student form"
```

---

### Task 4: Student edit — business logic and API route

**Files:**
- Modify: `apps/web/src/lib/school-setup/students.ts`
- Create: `apps/web/src/app/api/students/[id]/route.ts`
- Test: `apps/web/tests/students-id-api.test.ts` (new)

**Interfaces:**
- Produces: `getStudentForEdit(prisma, schoolId, studentId): Promise<{ id, name, rollNumber, photoUrl } | null>`, `updateStudent(prisma, schoolId, studentId, input: { rollNumber: string; photoUrl?: string | null }): Promise<UpdateStudentResult>` where `UpdateStudentResult = { ok: true; student: {...} } | { ok: false; error: "NOT_FOUND" | "DUPLICATE_ROLL_NUMBER" }`. `PATCH /api/students/:id` (admin-only) consuming these.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/students-id-api.test.ts`:

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
import { PATCH as patchStudent } from "../src/app/api/students/[id]/route";

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
      data: { phone: "+15557770001", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  async function seedStudent(schoolId: number, classId: number) {
    return prisma.student.create({
      data: {
        schoolId,
        name: "Test Student",
        dob: new Date("2016-01-01"),
        classId,
        section: "A",
        admissionNo: "SCH-EDIT-1",
        rollNumber: "1",
      },
    });
  }

  it("updates rollNumber and photoUrl", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const student = await seedStudent(school.id, klass.id);

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ rollNumber: "2", photoUrl: "/uploads/students/x.png" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(200);

    const updated = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updated).toMatchObject({ rollNumber: "2", photoUrl: "/uploads/students/x.png" });
  });

  it("rejects a duplicate rollNumber within the same class with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const student = await seedStudent(school.id, klass.id);
    await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Other Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-EDIT-2",
        rollNumber: "9",
      },
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ rollNumber: "9" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(409);
  });

  it("returns 404 for a student in a different school", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 5", section: "A" },
    });
    const otherStudent = await seedStudent(otherSchool.id, otherClass.id);

    const request = new Request(`http://localhost/api/students/${otherStudent.id}`, {
      method: "PATCH",
      body: JSON.stringify({ rollNumber: "2" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(otherStudent.id) } });
    expect(response.status).toBe(404);
  });

  it("rejects a teacher (non-admin) with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const student = await seedStudent(school.id, klass.id);
    const teacher = await prisma.user.create({
      data: { phone: "+15557770002", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ rollNumber: "2" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(403);
  });

  it("rejects a missing rollNumber with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const student = await seedStudent(school.id, klass.id);

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/students-id-api.test.ts`
Expected: FAIL — `../src/app/api/students/[id]/route` doesn't exist.

- [ ] **Step 3: Add `getStudentForEdit` and `updateStudent` to `students.ts`**

Append to `apps/web/src/lib/school-setup/students.ts` (after the existing `createStudent` function, before the file ends):

```ts

export interface StudentEditDetail {
  id: number;
  name: string;
  rollNumber: string;
  photoUrl: string | null;
}

export async function getStudentForEdit(
  prisma: PrismaClient,
  schoolId: number,
  studentId: number
): Promise<StudentEditDetail | null> {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) {
    return null;
  }
  return {
    id: student.id,
    name: student.name,
    rollNumber: student.rollNumber,
    photoUrl: student.photoUrl,
  };
}

export type UpdateStudentResult =
  | { ok: true; student: StudentEditDetail }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" };

export async function updateStudent(
  prisma: PrismaClient,
  schoolId: number,
  studentId: number,
  input: { rollNumber: string; photoUrl?: string | null }
): Promise<UpdateStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const conflict = await prisma.student.findFirst({
    where: { classId: student.classId, rollNumber: input.rollNumber, id: { not: studentId } },
  });
  if (conflict) {
    return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
  }

  try {
    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { rollNumber: input.rollNumber, photoUrl: input.photoUrl ?? null },
    });
    return {
      ok: true,
      student: {
        id: updated.id,
        name: updated.name,
        rollNumber: updated.rollNumber,
        photoUrl: updated.photoUrl,
      },
    };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    }
    throw err;
  }
}
```

- [ ] **Step 4: Add the `PATCH` route**

Create `apps/web/src/app/api/students/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { updateStudent } from "@/lib/school-setup/students";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const studentId = Number(params.id);
    if (Number.isNaN(studentId)) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    let rollNumber: string | undefined;
    let photoUrl: string | null | undefined;
    try {
      ({ rollNumber, photoUrl } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!rollNumber) {
      return NextResponse.json({ error: "rollNumber is required" }, { status: 400 });
    }

    const result = await updateStudent(prisma, claims.schoolId, studentId, { rollNumber, photoUrl });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Student not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "A student with this roll number already exists in this class" },
        { status: 409 }
      );
    }

    return NextResponse.json(result.student);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/students-id-api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the full suite to check for regressions**

Run: `cd apps/web && npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/school-setup/students.ts apps/web/src/app/api/students/\[id\]/route.ts apps/web/tests/students-id-api.test.ts
git commit -m "feat: add student edit (rollNumber/photoUrl) API"
```

---

### Task 5: Student edit page and form, plus an Edit link from the students list

**Files:**
- Create: `apps/web/src/components/school-setup/EditStudentForm.tsx`
- Create: `apps/web/src/app/dashboard/students/[id]/edit/page.tsx`
- Modify: `apps/web/src/app/dashboard/students/page.tsx`
- Test: `apps/web/tests/edit-student-form.test.tsx` (new)

**Interfaces:**
- Consumes: `getStudentForEdit` (Task 4), `requireDashboardRole` (existing), `POST /api/students/upload-photo` (Task 2), `PATCH /api/students/:id` (Task 4).

- [ ] **Step 1: Write the failing test for `EditStudentForm`**

Create `apps/web/tests/edit-student-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditStudentForm } from "../src/components/school-setup/EditStudentForm";

describe("EditStudentForm", () => {
  afterEach(() => cleanup());

  it("pre-fills the current rollNumber and submits a PATCH with the updated value", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, name: "Existing Student", rollNumber: "9", photoUrl: null }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EditStudentForm student={{ id: 1, name: "Existing Student", rollNumber: "5", photoUrl: null }} />
    );

    const rollNumberInput = screen.getByLabelText("Roll number") as HTMLInputElement;
    expect(rollNumberInput.value).toBe("5");

    await userEvent.clear(rollNumberInput);
    await userEvent.type(rollNumberInput, "9");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/students/1",
        expect.objectContaining({ method: "PATCH" })
      );
    });
    const requestBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.rollNumber).toBe("9");
  });

  it("shows a success message after saving", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, name: "Existing Student", rollNumber: "5", photoUrl: null }), {
          status: 200,
        })
      )
    );

    render(
      <EditStudentForm student={{ id: 1, name: "Existing Student", rollNumber: "5", photoUrl: null }} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByText("Student updated")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/edit-student-form.test.tsx`
Expected: FAIL — `EditStudentForm` module doesn't exist.

- [ ] **Step 3: Implement `EditStudentForm`**

Create `apps/web/src/components/school-setup/EditStudentForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

export function EditStudentForm({
  student,
}: {
  student: { id: number; name: string; rollNumber: string; photoUrl: string | null };
}) {
  const [rollNumber, setRollNumber] = useState(student.rollNumber);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    let photoUrl: string | undefined;
    if (photo) {
      const formData = new FormData();
      formData.append("file", photo);
      const uploadResponse = await fetch("/api/students/upload-photo", {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) {
        const body = await uploadResponse.json();
        setError(body.error);
        return;
      }
      const uploadBody = await uploadResponse.json();
      photoUrl = uploadBody.photoUrl;
    }

    const response = await fetch(`/api/students/${student.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rollNumber, photoUrl }),
    });

    if (response.ok) {
      setMessage("Student updated");
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        type="text"
        aria-label="Roll number"
        value={rollNumber}
        onChange={(event) => setRollNumber(event.target.value)}
        className={inputClass}
        placeholder="Roll number"
      />
      <input
        type="file"
        aria-label="Student photo"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
        className={inputClass}
      />
      <button
        type="submit"
        className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
      >
        Save Changes
      </button>
      {error && <p className="w-full text-xs text-red-500">{error}</p>}
      {message && <p className="w-full text-xs text-emerald-600">{message}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/edit-student-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the edit page**

Create `apps/web/src/app/dashboard/students/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getStudentForEdit } from "@/lib/school-setup/students";
import { prisma } from "@/lib/prisma";
import { EditStudentForm } from "@/components/school-setup/EditStudentForm";

export default async function EditStudentPage({ params }: { params: { id: string } }) {
  const claims = requireDashboardRole(["admin"]);
  const studentId = Number(params.id);
  if (Number.isNaN(studentId)) {
    notFound();
  }

  const student = await getStudentForEdit(prisma, claims.schoolId, studentId);
  if (!student) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Edit Student</h1>
        <p className="text-xs text-neutral-400">{student.name}</p>
      </div>
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <EditStudentForm student={student} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add an "Edit" link and a Roll No. column to the students list**

In `apps/web/src/app/dashboard/students/page.tsx`, replace the `<thead>`/`<tbody>` block:

```tsx
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Admission No.</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Class</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Parent(s)</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                  {student.name}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.admissionNo}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.class.name} {student.class.section}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.parents.map((parent) => `${parent.name} (${parent.phone})`).join(", ") ||
                    "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
```

to:

```tsx
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Admission No.</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Roll No.</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Class</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Parent(s)</th>
              {isAdmin && <th className="border-b border-neutral-100 pb-2 pr-4"></th>}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                  {student.name}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.admissionNo}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.rollNumber}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.class.name} {student.class.section}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.parents.map((parent) => `${parent.name} (${parent.phone})`).join(", ") ||
                    "—"}
                </td>
                {isAdmin && (
                  <td className="border-b border-neutral-50 py-2 pr-4">
                    <a
                      href={`/dashboard/students/${student.id}/edit`}
                      className="text-xs font-semibold text-neutral-700 underline hover:text-neutral-900"
                    >
                      Edit
                    </a>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
```

- [ ] **Step 7: Run the full suite to check for regressions**

Run: `cd apps/web && npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/school-setup/EditStudentForm.tsx apps/web/src/app/dashboard/students/\[id\]/edit/page.tsx apps/web/src/app/dashboard/students/page.tsx apps/web/tests/edit-student-form.test.tsx
git commit -m "feat: add student edit page for rollNumber/photo"
```

---

### Task 6: Include `rollNumber`/`photoUrl` in the attendance roster

**Files:**
- Modify: `apps/web/src/lib/attendance.ts`
- Modify: `apps/web/tests/attendance-api.test.ts`

**Interfaces:**
- Produces: `RosterEntry` gains `rollNumber: string` and `photoUrl: string | null`. `getAttendanceRoster` return shape changes accordingly — consumed by `AttendanceView` in Task 10.

- [ ] **Step 1: Update `RosterEntry` and the mapping in `getAttendanceRoster`**

In `apps/web/src/lib/attendance.ts`, change the interface:

```ts
export interface RosterEntry {
  studentId: number;
  name: string;
  status: AttendanceStatus | null;
  note: string | null;
  monthPercent: number;
}
```

to:

```ts
export interface RosterEntry {
  studentId: number;
  name: string;
  rollNumber: string;
  photoUrl: string | null;
  status: AttendanceStatus | null;
  note: string | null;
  monthPercent: number;
}
```

And change the mapping:

```ts
    return {
      studentId: student.id,
      name: student.name,
      status: todayRecord ? todayRecord.status : null,
      note: todayRecord ? todayRecord.note : null,
      monthPercent,
    };
```

to:

```ts
    return {
      studentId: student.id,
      name: student.name,
      rollNumber: student.rollNumber,
      photoUrl: student.photoUrl,
      status: todayRecord ? todayRecord.status : null,
      note: todayRecord ? todayRecord.note : null,
      monthPercent,
    };
```

(No Prisma query change needed — `prisma.student.findMany` already returns all scalar columns including the new `rollNumber`/`photoUrl` by default.)

- [ ] **Step 2: Update the existing roster-shape assertion in `attendance-api.test.ts`**

In `apps/web/tests/attendance-api.test.ts`, change:

```ts
    expect(body.students).toEqual([
      { studentId: student.id, name: "Test Student", status: null, note: null, monthPercent: 0 },
    ]);
```

to:

```ts
    expect(body.students).toEqual([
      {
        studentId: student.id,
        name: "Test Student",
        rollNumber: "1",
        photoUrl: null,
        status: null,
        note: null,
        monthPercent: 0,
      },
    ]);
```

- [ ] **Step 3: Run the attendance API tests**

Run: `cd apps/web && npx vitest run tests/attendance-api.test.ts`
Expected: PASS (all existing attendance tests, including the updated shape assertion).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/attendance.ts apps/web/tests/attendance-api.test.ts
git commit -m "feat: include rollNumber/photoUrl in the attendance roster"
```

---

### Task 7: `markAttendance` — support a null status as "delete this record"

**Files:**
- Modify: `apps/web/src/lib/attendance.ts`
- Modify: `apps/web/src/app/api/attendance/route.ts`
- Modify: `apps/web/tests/attendance-api.test.ts`

**Interfaces:**
- Produces: `markAttendance`'s `entries[].status` type widens to `"present" | "absent" | "late" | null`. A `null` entry deletes any existing `Attendance` row for that student+date instead of upserting. Consumed by `AttendanceView` in Task 10, which now submits every student (including unmarked ones) on every save.

- [ ] **Step 1: Write the failing tests**

Append to the `describe("/api/attendance", ...)` block in `apps/web/tests/attendance-api.test.ts` (before the closing `});`):

```ts
  it("deletes an existing attendance record when the entry status is null", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    await prisma.attendance.create({
      data: { studentId: student.id, date: new Date("2026-07-06"), status: "present", markedById: teacher.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
        entries: [{ studentId: student.id, status: null }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record).toBeNull();
  });

  it("is a no-op when a null-status entry has no existing record", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
        entries: [{ studentId: student.id, status: null }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record).toBeNull();
  });

  it("applies a mix of present, absent, late, and null entries in a single submit", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const secondStudent = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Second Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-502",
        rollNumber: "2",
      },
    });
    const thirdStudent = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Third Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-503",
        rollNumber: "3",
      },
    });
    await prisma.attendance.create({
      data: { studentId: thirdStudent.id, date: new Date("2026-07-06"), status: "present", markedById: teacher.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
        entries: [
          { studentId: student.id, status: "absent" },
          { studentId: secondStudent.id, status: "late" },
          { studentId: thirdStudent.id, status: null },
        ],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const records = await prisma.attendance.findMany({ where: { date: new Date("2026-07-06") } });
    expect(records.find((r) => r.studentId === student.id)?.status).toBe("absent");
    expect(records.find((r) => r.studentId === secondStudent.id)?.status).toBe("late");
    expect(records.find((r) => r.studentId === thirdStudent.id)).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/attendance-api.test.ts`
Expected: FAIL — the first new test fails because `markAttendance` still tries to `upsert` a `null` status, which Prisma rejects as an invalid `AttendanceStatus` value.

- [ ] **Step 3: Update `markAttendance` to branch on `null` status**

In `apps/web/src/lib/attendance.ts`, change the `markAttendance` signature and transaction body:

```ts
export async function markAttendance(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "present" | "absent" | "late"; note?: string }>;
  }
): Promise<MarkAttendanceResult> {
```

to:

```ts
export async function markAttendance(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "present" | "absent" | "late" | null; note?: string }>;
  }
): Promise<MarkAttendanceResult> {
```

And change the `$transaction` call:

```ts
  await prisma.$transaction(
    params.entries.map((entry) =>
      prisma.attendance.upsert({
        where: { studentId_date: { studentId: entry.studentId, date: targetDate } },
        create: {
          studentId: entry.studentId,
          date: targetDate,
          status: entry.status,
          markedById: params.teacherUserId,
          note: entry.note ?? null,
        },
        update: {
          status: entry.status,
          markedById: params.teacherUserId,
          note: entry.note ?? null,
        },
      })
    )
  );
```

to:

```ts
  await prisma.$transaction(
    params.entries.map((entry) =>
      entry.status === null
        ? prisma.attendance.deleteMany({
            where: { studentId: entry.studentId, date: targetDate },
          })
        : prisma.attendance.upsert({
            where: { studentId_date: { studentId: entry.studentId, date: targetDate } },
            create: {
              studentId: entry.studentId,
              date: targetDate,
              status: entry.status,
              markedById: params.teacherUserId,
              note: entry.note ?? null,
            },
            update: {
              status: entry.status,
              markedById: params.teacherUserId,
              note: entry.note ?? null,
            },
          })
    )
  );
```

- [ ] **Step 4: Update the POST route's type cast**

In `apps/web/src/app/api/attendance/route.ts`, change:

```ts
    let entries: Array<{ studentId: number; status: string; note?: string }> | undefined;
```

to:

```ts
    let entries: Array<{ studentId: number; status: string | null; note?: string }> | undefined;
```

and change:

```ts
    const result = await markAttendance(prisma, {
      classId,
      date,
      teacherUserId: claims.userId,
      entries: entries as Array<{
        studentId: number;
        status: "present" | "absent" | "late";
        note?: string;
      }>,
    });
```

to:

```ts
    const result = await markAttendance(prisma, {
      classId,
      date,
      teacherUserId: claims.userId,
      entries: entries as Array<{
        studentId: number;
        status: "present" | "absent" | "late" | null;
        note?: string;
      }>,
    });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/attendance-api.test.ts`
Expected: PASS (all attendance tests, including the 3 new ones).

- [ ] **Step 6: Run the full suite to check for regressions**

Run: `cd apps/web && npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/attendance.ts apps/web/src/app/api/attendance/route.ts apps/web/tests/attendance-api.test.ts
git commit -m "feat: support unmarking attendance via a null status"
```

---

### Task 8: Shared status-cycling helper

**Files:**
- Create: `apps/web/src/lib/attendance-status.ts`
- Test: `apps/web/tests/attendance-status.test.ts` (new)

**Interfaces:**
- Produces: `type AttendanceStatusValue = "present" | "absent" | "late" | null` and `cycleAttendanceStatus(current: AttendanceStatusValue): AttendanceStatusValue`. Consumed by `StudentAttendanceCard`'s host (`AttendanceView`) and `AttendanceReviewPanel` in later tasks.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/attendance-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cycleAttendanceStatus } from "../src/lib/attendance-status";

describe("cycleAttendanceStatus", () => {
  it("cycles null -> present -> absent -> late -> null", () => {
    expect(cycleAttendanceStatus(null)).toBe("present");
    expect(cycleAttendanceStatus("present")).toBe("absent");
    expect(cycleAttendanceStatus("absent")).toBe("late");
    expect(cycleAttendanceStatus("late")).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/attendance-status.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/attendance-status.ts`:

```ts
export type AttendanceStatusValue = "present" | "absent" | "late" | null;

const CYCLE_ORDER: AttendanceStatusValue[] = [null, "present", "absent", "late"];

export function cycleAttendanceStatus(current: AttendanceStatusValue): AttendanceStatusValue {
  const currentIndex = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/attendance-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/attendance-status.ts apps/web/tests/attendance-status.test.ts
git commit -m "feat: add attendance status cycling helper"
```

---

### Task 9: `StudentAttendanceCard` component

**Files:**
- Create: `apps/web/src/components/attendance/StudentAttendanceCard.tsx`
- Test: `apps/web/tests/student-attendance-card.test.tsx` (new)

**Interfaces:**
- Produces: `StudentAttendanceCard({ name, rollNumber, photoUrl, status, onClick })` — a presentational button. Consumed by `AttendanceReviewPanel` (Task 10) and `AttendanceView` (Task 11).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/student-attendance-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentAttendanceCard } from "../src/components/attendance/StudentAttendanceCard";

describe("StudentAttendanceCard", () => {
  afterEach(() => cleanup());

  it("shows initials when no photoUrl is provided", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status={null} onClick={() => {}} />
    );
    expect(screen.getByText("AV")).toBeInTheDocument();
  });

  it("renders the photo when photoUrl is provided", () => {
    render(
      <StudentAttendanceCard
        name="Asha Verma"
        rollNumber="12"
        photoUrl="/uploads/students/a.png"
        status="present"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "/uploads/students/a.png");
  });

  it("calls onClick when the card is clicked", async () => {
    const onClick = vi.fn();
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status={null} onClick={onClick} />
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows the status label matching the current status", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status="absent" onClick={() => {}} />
    );
    expect(screen.getByText("Absent")).toBeInTheDocument();
  });

  it("exposes the current status in the accessible name", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status="late" onClick={() => {}} />
    );
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Late")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/student-attendance-card.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/attendance/StudentAttendanceCard.tsx`:

```tsx
"use client";

type Status = "present" | "absent" | "late" | null;

const STATUS_STYLES: Record<"present" | "absent" | "late" | "null", string> = {
  present: "border-emerald-300 bg-emerald-50",
  absent: "border-red-300 bg-red-50",
  late: "border-amber-300 bg-amber-50",
  null: "border-neutral-200 bg-white",
};

const STATUS_LABEL: Record<"present" | "absent" | "late" | "null", string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  null: "Unmarked",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function StudentAttendanceCard({
  name,
  rollNumber,
  photoUrl,
  status,
  onClick,
}: {
  name: string;
  rollNumber: string;
  photoUrl: string | null;
  status: Status;
  onClick: () => void;
}) {
  const key = status ?? "null";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Attendance for ${name}, currently ${STATUS_LABEL[key]}`}
      className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all ${STATUS_STYLES[key]}`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-sm font-bold text-neutral-600">
          {initials(name)}
        </span>
      )}
      <span className="text-xs font-semibold text-neutral-800">{name}</span>
      <span className="text-[11px] text-neutral-400">Roll No. {rollNumber}</span>
      <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
        {STATUS_LABEL[key]}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/student-attendance-card.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/attendance/StudentAttendanceCard.tsx apps/web/tests/student-attendance-card.test.tsx
git commit -m "feat: add StudentAttendanceCard component"
```

---

### Task 10: `AttendanceReviewPanel` component

**Files:**
- Create: `apps/web/src/components/attendance/AttendanceReviewPanel.tsx`
- Test: `apps/web/tests/attendance-review-panel.test.tsx` (new)

**Interfaces:**
- Consumes: `StudentAttendanceCard` (Task 9).
- Produces: `AttendanceReviewPanel({ entries, onCycle, onBack, onConfirm })` where `entries: Array<{ studentId: number; name: string; rollNumber: string; photoUrl: string | null; status: "present" | "absent" | "late" | null }>`. Consumed by `AttendanceView` in Task 11.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/attendance-review-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceReviewPanel } from "../src/components/attendance/AttendanceReviewPanel";

describe("AttendanceReviewPanel", () => {
  afterEach(() => cleanup());

  const entries = [
    { studentId: 1, name: "Absent Student", rollNumber: "1", photoUrl: null, status: "absent" as const },
    { studentId: 2, name: "Unmarked Student", rollNumber: "2", photoUrl: null, status: null },
  ];

  it("renders one card per entry", () => {
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Absent Student")).toBeInTheDocument();
    expect(screen.getByText("Unmarked Student")).toBeInTheDocument();
  });

  it("shows an all-clear message when entries is empty", () => {
    render(<AttendanceReviewPanel entries={[]} onCycle={() => {}} onBack={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Every student is marked present.")).toBeInTheDocument();
  });

  it("calls onCycle with the clicked student's id", async () => {
    const onCycle = vi.fn();
    render(<AttendanceReviewPanel entries={entries} onCycle={onCycle} onBack={() => {}} onConfirm={() => {}} />);
    await userEvent.click(screen.getByText("Absent Student"));
    expect(onCycle).toHaveBeenCalledWith(1);
  });

  it("calls onConfirm when Confirm & Submit is clicked", async () => {
    const onConfirm = vi.fn();
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={() => {}} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm & Submit" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when Back is clicked", async () => {
    const onBack = vi.fn();
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={onBack} onConfirm={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/attendance-review-panel.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/attendance/AttendanceReviewPanel.tsx`:

```tsx
"use client";

import { StudentAttendanceCard } from "./StudentAttendanceCard";

export interface ReviewEntry {
  studentId: number;
  name: string;
  rollNumber: string;
  photoUrl: string | null;
  status: "present" | "absent" | "late" | null;
}

export function AttendanceReviewPanel({
  entries,
  onCycle,
  onBack,
  onConfirm,
}: {
  entries: ReviewEntry[];
  onCycle: (studentId: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div>
          <h2 className="text-sm font-bold text-neutral-800">Review Before Submitting</h2>
          <p className="text-xs text-neutral-400">
            These students are absent, late, or unmarked. Adjust anything before submitting.
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="text-xs text-neutral-500">Every student is marked present.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {entries.map((entry) => (
              <StudentAttendanceCard
                key={entry.studentId}
                name={entry.name}
                rollNumber={entry.rollNumber}
                photoUrl={entry.photoUrl}
                status={entry.status}
                onClick={() => onCycle(entry.studentId)}
              />
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Confirm & Submit
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/attendance-review-panel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/attendance/AttendanceReviewPanel.tsx apps/web/tests/attendance-review-panel.test.tsx
git commit -m "feat: add AttendanceReviewPanel component"
```

---

### Task 11: Rebuild `AttendanceView` around the card grid

**Files:**
- Modify: `apps/web/src/components/attendance/AttendanceView.tsx` (full rewrite)
- Test: `apps/web/tests/attendance-view.test.tsx` (new)

**Interfaces:**
- Consumes: `StudentAttendanceCard` (Task 9), `AttendanceReviewPanel` (Task 10), `cycleAttendanceStatus`/`AttendanceStatusValue` (Task 8), `GET`/`POST /api/attendance` (Tasks 6-7, unchanged contract shape but `RosterEntry` now includes `rollNumber`/`photoUrl`, and POST accepts `null` statuses).
- Produces: the `AttendanceView` component rendered by `apps/web/src/app/dashboard/attendance/page.tsx` (no prop changes there — still `{ classes, role }`).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/attendance-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceView } from "../src/components/attendance/AttendanceView";

const classes = [{ id: 1, name: "Grade 5", section: "A" }];
const roster = [
  { studentId: 1, name: "Asha Verma", rollNumber: "1", photoUrl: null, status: null, note: null, monthPercent: 0 },
  {
    studentId: 2,
    name: "Beena Rao",
    rollNumber: "2",
    photoUrl: null,
    status: "present",
    note: null,
    monthPercent: 100,
  },
];

describe("AttendanceView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ students: roster }), { status: 200 }))
    );
  });

  afterEach(() => cleanup());

  it("renders one card per student after loading the roster", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => {
      expect(screen.getByText("Asha Verma")).toBeInTheDocument();
      expect(screen.getByText("Beena Rao")).toBeInTheDocument();
    });
  });

  it("cycles a card's status through null -> present -> absent on repeated clicks", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    const card = screen.getByLabelText("Attendance for Asha Verma, currently Unmarked");
    await userEvent.click(card);
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Present")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Attendance for Asha Verma, currently Present"));
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Absent")).toBeInTheDocument();
  });

  it("Mark All Present turns every card present", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    await userEvent.click(screen.getByRole("button", { name: "Mark All Present" }));

    expect(screen.getByLabelText("Attendance for Asha Verma, currently Present")).toBeInTheDocument();
    expect(screen.getByLabelText("Attendance for Beena Rao, currently Present")).toBeInTheDocument();
  });

  it("Reset clears every card back to unmarked", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("Attendance for Asha Verma, currently Unmarked")).toBeInTheDocument();
    expect(screen.getByLabelText("Attendance for Beena Rao, currently Unmarked")).toBeInTheDocument();
  });

  it("opens the review panel listing only non-present students", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    await userEvent.click(screen.getByRole("button", { name: "Submit All" }));

    expect(screen.getByText("Review Before Submitting")).toBeInTheDocument();
    expect(screen.getAllByText("Asha Verma")).toHaveLength(2);
    expect(screen.getAllByText("Beena Rao")).toHaveLength(1);
  });

  it("submits all current statuses and shows a success message on Confirm & Submit", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    await userEvent.click(screen.getByRole("button", { name: "Submit All" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm & Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Attendance submitted")).toBeInTheDocument();
    });
  });

  it("does not render bulk actions or Submit All for admin", async () => {
    render(<AttendanceView classes={classes} role="admin" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    expect(screen.queryByRole("button", { name: "Mark All Present" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit All" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/attendance-view.test.tsx`
Expected: FAIL — the current `AttendanceView` renders a table with `<select>`s, not cards with the expected accessible names/buttons.

- [ ] **Step 3: Rewrite `AttendanceView`**

Replace the full contents of `apps/web/src/components/attendance/AttendanceView.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { StudentAttendanceCard } from "./StudentAttendanceCard";
import { AttendanceReviewPanel } from "./AttendanceReviewPanel";
import { cycleAttendanceStatus, type AttendanceStatusValue } from "@/lib/attendance-status";

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

interface RosterEntry {
  studentId: number;
  name: string;
  rollNumber: string;
  photoUrl: string | null;
  status: AttendanceStatusValue;
  note: string | null;
  monthPercent: number;
}

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 focus:border-neutral-400 focus:outline-none";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceView({
  classes,
  role,
}: {
  classes: ClassOption[];
  role: "teacher" | "admin";
}) {
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [date, setDate] = useState(todayDateString());
  const [students, setStudents] = useState<RosterEntry[]>([]);
  const [statusMap, setStatusMap] = useState<Record<number, AttendanceStatusValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  function applyRoster(roster: RosterEntry[]) {
    setStudents(roster);
    const nextStatusMap: Record<number, AttendanceStatusValue> = {};
    for (const student of roster) {
      nextStatusMap[student.studentId] = student.status;
    }
    setStatusMap(nextStatusMap);
  }

  useEffect(() => {
    if (!classId) return;
    setError(null);
    setMessage(null);
    setReviewOpen(false);
    fetch(`/api/attendance?classId=${classId}&date=${date}`).then(async (response) => {
      if (!response.ok) {
        const body = await response.json();
        setError(body.error);
        setStudents([]);
        setStatusMap({});
        return;
      }
      const body = await response.json();
      applyRoster(body.students as RosterEntry[]);
    });
  }, [classId, date]);

  function markAll(status: AttendanceStatusValue) {
    const nextStatusMap: Record<number, AttendanceStatusValue> = {};
    for (const student of students) {
      nextStatusMap[student.studentId] = status;
    }
    setStatusMap(nextStatusMap);
  }

  function cycleStudent(studentId: number) {
    setStatusMap((prev) => ({
      ...prev,
      [studentId]: cycleAttendanceStatus(prev[studentId] ?? null),
    }));
  }

  async function handleConfirmSubmit() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: Number(classId),
        date,
        entries: students.map((student) => ({
          studentId: student.studentId,
          status: statusMap[student.studentId] ?? null,
        })),
      }),
    });

    if (response.ok) {
      setMessage("Attendance submitted");
      setReviewOpen(false);
      const refreshed = await fetch(`/api/attendance?classId=${classId}&date=${date}`);
      if (refreshed.ok) {
        const body = await refreshed.json();
        applyRoster(body.students as RosterEntry[]);
      }
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  const reviewEntries = students
    .filter((student) => (statusMap[student.studentId] ?? null) !== "present")
    .map((student) => ({
      studentId: student.studentId,
      name: student.name,
      rollNumber: student.rollNumber,
      photoUrl: student.photoUrl,
      status: statusMap[student.studentId] ?? null,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Class"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          className={inputClass}
        >
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name} {klass.section}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Attendance date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={inputClass}
        />
      </div>

      {role === "teacher" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => markAll("present")}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-700"
          >
            Mark All Present
          </button>
          <button
            type="button"
            onClick={() => markAll("absent")}
            className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-red-600"
          >
            Mark All Absent
          </button>
          <button
            type="button"
            onClick={() => markAll(null)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
          >
            Reset
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {students.map((student) => (
          <StudentAttendanceCard
            key={student.studentId}
            name={student.name}
            rollNumber={student.rollNumber}
            photoUrl={student.photoUrl}
            status={statusMap[student.studentId] ?? null}
            onClick={role === "teacher" ? () => cycleStudent(student.studentId) : () => {}}
          />
        ))}
      </div>

      {role === "teacher" && (
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="w-fit self-end rounded-full bg-neutral-900 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Submit All
        </button>
      )}

      {reviewOpen && (
        <AttendanceReviewPanel
          entries={reviewEntries}
          onCycle={cycleStudent}
          onBack={() => setReviewOpen(false)}
          onConfirm={handleConfirmSubmit}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/attendance-view.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `cd apps/web && npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/attendance/AttendanceView.tsx apps/web/tests/attendance-view.test.tsx
git commit -m "feat: rebuild attendance marking as a card grid"
```

---

### Task 12: Manual verification in the browser

This is the "does it actually work end-to-end" check — automated tests cover logic and rendering, but not that the real page loads, looks right, and survives a real click-through with a real database.

**Files:** none (verification only).

- [ ] **Step 1: Seed a local database**

Run: `cd apps/web && npm run seed`
Expected: seed script completes without error (uses `createSeedFixtures`, which now includes `rollNumber` from Task 1).

- [ ] **Step 2: Start the dev server**

Use the `mcp__Claude_Preview__preview_start` tool (or `npm run dev` if that tool is unavailable) to start the `web` app.

- [ ] **Step 3: Log in as the seeded teacher and open Attendance**

The seed fixtures create a teacher with phone `+10000000001` (see `apps/web/prisma/fixtures.ts`). Log in through `/login`, request an OTP, and check the terminal/dev logs for the code (OTP delivery is logged, not actually sent, per the existing `send-otp` flow). Navigate to `/dashboard/attendance`.

- [ ] **Step 4: Walk through the full flow**

- Confirm the seeded student ("Rohan Sharma") renders as a card with an initials avatar (no `photoUrl` seeded) and "Roll No. GH-2026-001".
- Click the card once — it should turn green/"Present". Click again — red/"Absent". Click again — amber/"Late". Click again — back to neutral/"Unmarked".
- Click "Mark All Present" — card turns green.
- Click "Mark All Absent" — card turns red.
- Click "Reset" — card returns to neutral.
- Click "Submit All" — the review panel should open. Since the only student is currently unmarked, it should appear in the review list.
- Click a card inside the review panel to cycle it to "Present", confirm it updates live.
- Click "Back" — panel closes, main grid still reflects the change.
- Click "Submit All" again, then "Confirm & Submit" — panel closes, a success message appears on the main page.
- Reload the page — the submitted status should still be reflected (persisted via the API).

- [ ] **Step 5: Check for console/network errors**

Use `mcp__Claude_Preview__preview_console_logs` (level: `error`) and `mcp__Claude_Preview__preview_network` (filter: `failed`) to confirm no unexpected errors occurred during the walkthrough.

- [ ] **Step 6: Report results**

No commit for this task — report back what was verified (and screenshot if useful) rather than claiming success without having driven the flow.

---

## Execution Notes

- Tasks 1-7 must run in order (each depends on the previous task's schema/lib changes). Tasks 8-9 (shared helper, `StudentAttendanceCard`) can run in either order relative to each other but must both complete before Task 10 (`AttendanceReviewPanel`, which imports `StudentAttendanceCard`) and Task 11 (`AttendanceView`, which imports both `StudentAttendanceCard` and `AttendanceReviewPanel` and the status helper).
- Tasks 2-5 (photo upload/edit) are independent of Tasks 6-11 (attendance card UI) except that Task 6 displays `photoUrl`/`rollNumber` which Task 1 already adds to the schema — Tasks 6-11 do not require Tasks 2-5 to be done first, only Task 1.
