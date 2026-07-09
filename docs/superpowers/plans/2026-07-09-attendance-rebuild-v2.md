# Attendance Rebuild (Card UI) v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the table-based teacher attendance flow with a card-based UI (photo, name, roll number, click-to-cycle status, bulk actions, review-before-submit), built against the real merged Enrollment-based schema, and re-add the roll number / photo upload capability that a prior merge reverted.

**Architecture:** Next.js 14 App Router, `lib/<feature>.ts` business logic + thin `app/api/<feature>/route.ts` handlers + page → client "View" component → presentational sub-components, matching this codebase's established pattern. Prisma/PostgreSQL, Vitest (real seeded Postgres for API-level tests, jsdom + Testing Library for component tests). `Student.classId` does not exist — class membership and roll number are per-academic-year via the `Enrollment` model.

**Tech Stack:** Next.js 14, React 18, Prisma 5, PostgreSQL, Tailwind CSS v3, Vitest, @testing-library/react.

## Global Constraints

- `Enrollment.rollNumber` (already exists, nullable `String?`) is optional — admins may leave it unset. When set, it must be unique within `(classId, academicYearId)`.
- `Student.photoUrl` (new, nullable `String?`) — a student's photo is a property of the person, not a given year's enrollment.
- Photo storage is local disk under `apps/web/public/uploads/students/` — no external object storage. Upload accepts only `image/png`, `image/jpeg`, `image/webp`, max 2MB.
- The `late` attendance status is kept as a fully equivalent third markable state. Card click-cycle order: `null → present → absent → late → null`.
- Admin's read-only attendance view, per-student notes, and month% column are dropped from the rebuilt attendance component entirely (not redesigned here).
- A card omits its "Roll No." line entirely when `rollNumber` is `null` — never show a placeholder implying a number exists.
- **Known pre-existing failures, out of scope:** `tests/dashboard-overview.test.ts` (6 tests) and `tests/nav-items.test.ts` (1 test) currently fail against a fresh database — this is leftover breakage from an incomplete academic-year/enrollment retrofit on a branch merged into this one, unrelated to attendance/students. **Do not attempt to fix these.** When running the full suite, these 7 failures are expected; only investigate a failure outside this list. (As of Task 6, `tests/scoped-queries.test.ts` — originally listed here with 2 failures — now passes cleanly; that count was stale, resolved by unrelated concurrent work.)
- **Shared local Postgres:** other git worktrees on this machine point at the same local Postgres container and can collide on the default `school_is_test` database. This plan uses a dedicated database, `school_is_test_dae667`, for all test/migration commands — always prefix commands with `DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667"` as shown in each step. This database already exists with the current 5 migrations applied (`20260705093032_init` through `20260707114636_user_status_and_class_archived`) — do not drop or recreate it except as instructed in Task 1.
- Reference spec: [docs/superpowers/specs/2026-07-09-attendance-rebuild-v2-design.md](../specs/2026-07-09-attendance-rebuild-v2-design.md).

---

### Task 1: Schema — `Student.photoUrl`, `Enrollment` roll number uniqueness, fix the fixtures.ts bug

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: new Prisma migration
- Modify: `apps/web/prisma/fixtures.ts`

**Interfaces:**
- Produces: `Student.photoUrl: string | null` and a unique index on `Enrollment(classId, academicYearId, rollNumber)`, both usable by every later task.

- [ ] **Step 1: Edit the Prisma schema**

In `apps/web/prisma/schema.prisma`, change the `Student` model's field list from:
```prisma
  admissionNo String        @unique
  status      StudentStatus @default(active)
```
to:
```prisma
  admissionNo String        @unique
  status      StudentStatus @default(active)
  photoUrl    String?
```

And change the `Enrollment` model from:
```prisma
model Enrollment {
  id             Int              @id @default(autoincrement())
  student        Student          @relation(fields: [studentId], references: [id])
  studentId      Int
  class          Class            @relation(fields: [classId], references: [id])
  classId        Int
  academicYear   AcademicYear     @relation(fields: [academicYearId], references: [id])
  academicYearId Int
  rollNumber     String?
  status         EnrollmentStatus @default(active)
  createdAt      DateTime         @default(now())

  @@unique([studentId, academicYearId])
}
```
to:
```prisma
model Enrollment {
  id             Int              @id @default(autoincrement())
  student        Student          @relation(fields: [studentId], references: [id])
  studentId      Int
  class          Class            @relation(fields: [classId], references: [id])
  classId        Int
  academicYear   AcademicYear     @relation(fields: [academicYearId], references: [id])
  academicYearId Int
  rollNumber     String?
  status         EnrollmentStatus @default(active)
  createdAt      DateTime         @default(now())

  @@unique([studentId, academicYearId])
  @@unique([classId, academicYearId, rollNumber])
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is" npx prisma migrate dev --name student_photo_and_enrollment_roll_number`
Expected: a new timestamped directory appears under `apps/web/prisma/migrations/`, Prisma prints "Your database is now in sync with your schema" and regenerates the client.

If the command refuses to run because the shell is non-interactive (`Error: Prisma Migrate has detected that the environment is non-interactive`), hand-author the migration instead:
1. Create `apps/web/prisma/migrations/<TIMESTAMP>_student_photo_and_enrollment_roll_number/migration.sql` (use a timestamp later than `20260707114636`, e.g. `20260710000000`) with:
```sql
-- AlterTable
ALTER TABLE "Student" ADD COLUMN "photoUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_classId_academicYearId_rollNumber_key" ON "Enrollment"("classId", "academicYearId", "rollNumber");
```
2. Apply it to both databases:
```bash
cd apps/web
DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is" npx prisma migrate deploy
DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx prisma migrate deploy
npx prisma generate
```
Expected: "All migrations have been successfully applied" for both, then a clean `Generated Prisma Client` message.

- [ ] **Step 3: Fix the fixtures.ts bug**

In `apps/web/prisma/fixtures.ts`, change:
```ts
  const student = await prisma.student.create({
    data: {
      schoolId: school.id,
      name: "Rohan Sharma",
      dob: new Date("2015-04-12"),
      admissionNo: "GH-2026-001",
      rollNumber: "GH-2026-001",
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      classId: classA.id,
      academicYearId: academicYear.id,
      status: "active",
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
      admissionNo: "GH-2026-001",
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      classId: classA.id,
      academicYearId: academicYear.id,
      status: "active",
      rollNumber: "GH-2026-001",
    },
  });
```

- [ ] **Step 4: Run the seed test to verify the fix**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/seed.test.ts`
Expected: PASS (1 test) — this was failing before this fix with a Prisma validation error on `rollNumber`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations apps/web/prisma/fixtures.ts
git commit -m "feat: add Student.photoUrl and Enrollment roll number uniqueness"
```

---

### Task 2: `createStudent`/`editStudent`/`listStudents` — roll number & photo

**Files:**
- Modify: `apps/web/src/lib/school-setup/students.ts`
- Modify: `apps/web/src/app/api/students/route.ts`
- Modify: `apps/web/src/app/api/students/[id]/route.ts`
- Modify: `apps/web/tests/students-api.test.ts`

**Interfaces:**
- Consumes: `uniqueConstraintTarget`/`isUniqueConstraintViolation` from `./prisma-errors` (already exist, unchanged).
- Produces: `createStudent(prisma, schoolId, academicYearId, input)` where `input` gains `rollNumber?: string; photoUrl?: string`, and `CreateStudentResult` gains `{ ok: false; error: "DUPLICATE_ROLL_NUMBER" }`. `editStudent(prisma, params)` where `params.fields` gains `rollNumber?: string; photoUrl?: string`, and `EditStudentResult` gains the same `DUPLICATE_ROLL_NUMBER` case. `StudentSummary` gains `rollNumber: string | null; photoUrl: string | null`. Consumed by `StudentsView.tsx` (Task 4) and the attendance roster (Task 5, via the schema fields directly, not this file).

- [ ] **Step 1: Write the failing tests**

Two of the existing tests in `apps/web/tests/students-api.test.ts` currently fail (verify first — run `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/students-api.test.ts`, expect 4 failures: "creates a student linked to an existing parent", "creates a student and a new parent in one request", "rejects a duplicate admission number with 409", "rejects a parentPhone belonging to a non-parent role with 409" — these currently 400 because the route requires `rollNumber` but nothing sends it, which Step 3 below fixes by making it optional).

Append these new tests inside the existing `describe("/api/students", ...)` block, right before its closing `});`:

```ts
  it("creates a student with a roll number and photo url", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 8", section: "A" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Roll Number Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-ROLL-1",
        rollNumber: "5",
        photoUrl: "/uploads/students/x.png",
        parentPhone: "+15558880010",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(201);

    const getResponse = await getStudents();
    const list = await getResponse.json();
    const created = list.find((entry: { admissionNo: string }) => entry.admissionNo === "SCH-ROLL-1");
    expect(created).toMatchObject({ rollNumber: "5", photoUrl: "/uploads/students/x.png" });
  });

  it("rejects a duplicate rollNumber within the same class and year with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 9", section: "A" },
    });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "First Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-ROLL-2",
    });
    await prisma.enrollment.updateMany({
      where: { classId: klass.id, academicYearId: year.id },
      data: { rollNumber: "7" },
    });

    const postRequest = new Request("http://localhost/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: "Second Student",
        dob: "2016-01-01",
        classId: klass.id,
        admissionNo: "SCH-ROLL-3",
        rollNumber: "7",
        parentPhone: "+15558880011",
        parentName: "Some Parent",
      }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postStudents(postRequest);
    expect(postResponse.status).toBe(409);
  });
```

Append these new tests inside the existing `describe("/api/students/[id]", ...)` block, right before its closing `});`:

```ts
  it("updates rollNumber and photoUrl", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-ROLL-1",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: student.name, admissionNo: student.admissionNo, rollNumber: "3", photoUrl: "/uploads/students/y.png" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(200);

    const updatedStudent = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updatedStudent?.photoUrl).toBe("/uploads/students/y.png");
    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    });
    expect(enrollment?.rollNumber).toBe("3");
  });

  it("rejects a duplicate rollNumber on edit within the same class and year with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    await loginAsAdmin(school.id);
    const klass = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 5", section: "A" } });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Taken",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-ROLL-2",
    });
    await prisma.enrollment.updateMany({
      where: { classId: klass.id, academicYearId: year.id },
      data: { rollNumber: "9" },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Other",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-EDIT-ROLL-3",
    });

    const request = new Request(`http://localhost/api/students/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: student.name, admissionNo: student.admissionNo, rollNumber: "9" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchStudent(request, { params: { id: String(student.id) } });
    expect(response.status).toBe(409);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/students-api.test.ts`
Expected: FAIL — the 4 pre-existing failures plus the 4 new tests (rollNumber/photoUrl not yet supported by `createStudent`/`editStudent`/`listStudents`).

- [ ] **Step 3: Fix `POST /api/students` to make `rollNumber` optional**

In `apps/web/src/app/api/students/route.ts`, change:
```ts
    if (!name || !dob || !classId || !admissionNo || !rollNumber || !parentPhone) {
      return NextResponse.json(
        { error: "name, dob, classId, admissionNo, rollNumber, and parentPhone are required" },
        { status: 400 }
      );
    }
```
to:
```ts
    if (!name || !dob || !classId || !admissionNo || !parentPhone) {
      return NextResponse.json(
        { error: "name, dob, classId, admissionNo, and parentPhone are required" },
        { status: 400 }
      );
    }
```
(The rest of this file — the `rollNumber`/`photoUrl` destructuring, the `createStudent` call passing them through, and the `DUPLICATE_ROLL_NUMBER` → 409 branch — is already present and correct; it just needs `createStudent`'s type to actually accept these fields, which Step 4 provides.)

- [ ] **Step 4: Extend `createStudent`, `editStudent`, and `listStudents` in `students.ts`**

In `apps/web/src/lib/school-setup/students.ts`, change the import line:
```ts
import { isUniqueConstraintViolation } from "./prisma-errors";
```
to:
```ts
import { isUniqueConstraintViolation, uniqueConstraintTarget } from "./prisma-errors";
```

Change the `StudentSummary` interface from:
```ts
export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  status: StudentStatus;
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}
```
to:
```ts
export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: StudentStatus;
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}
```

Change `listStudents`'s return mapping from:
```ts
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
```
to:
```ts
  return students.map((student) => {
    const enrollment = student.enrollments[0];
    return {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      rollNumber: enrollment?.rollNumber ?? null,
      photoUrl: student.photoUrl,
      status: student.status,
      class: enrollment ? { name: enrollment.class.name, section: enrollment.class.section } : null,
      parents: student.parentLinks.map((link) => ({ name: link.parent.name, phone: link.parent.phone })),
    };
  });
```

Change `CreateStudentResult` and `createStudent` from:
```ts
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
  if (existingAdmission) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };

  const existingParent = await prisma.user.findUnique({ where: { phone: input.parentPhone } });
  if (existingParent && existingParent.role !== "parent") return { ok: false, error: "PHONE_WRONG_ROLE" };
  if (!existingParent && !input.parentName) return { ok: false, error: "PARENT_NAME_REQUIRED" };

  const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
  if (!targetClass) return { ok: false, error: "INVALID_CLASS" };

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
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    throw err;
  }
}
```
to:
```ts
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
  academicYearId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    rollNumber?: string;
    photoUrl?: string;
    parentPhone: string;
    parentName?: string;
  }
): Promise<CreateStudentResult> {
  const existingAdmission = await prisma.student.findUnique({ where: { admissionNo: input.admissionNo } });
  if (existingAdmission) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };

  if (input.rollNumber) {
    const existingRollNumber = await prisma.enrollment.findFirst({
      where: { classId: input.classId, academicYearId, rollNumber: input.rollNumber },
    });
    if (existingRollNumber) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
  }

  const existingParent = await prisma.user.findUnique({ where: { phone: input.parentPhone } });
  if (existingParent && existingParent.role !== "parent") return { ok: false, error: "PHONE_WRONG_ROLE" };
  if (!existingParent && !input.parentName) return { ok: false, error: "PARENT_NAME_REQUIRED" };

  const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
  if (!targetClass) return { ok: false, error: "INVALID_CLASS" };

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
          admissionNo: input.admissionNo,
          photoUrl: input.photoUrl ?? null,
        },
      });

      await tx.enrollment.create({
        data: {
          studentId: createdStudent.id,
          classId: input.classId,
          academicYearId,
          status: "active",
          rollNumber: input.rollNumber ?? null,
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
    if (target?.includes("rollNumber")) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    throw err;
  }
}
```

Change `EditStudentResult` and `editStudent` from:
```ts
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
  if (!student) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.admissionNo && params.fields.admissionNo !== student.admissionNo) {
    const existing = await prisma.student.findUnique({ where: { admissionNo: params.fields.admissionNo } });
    if (existing) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
  }

  if (params.fields.classId !== undefined) {
    if (!params.academicYearId) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId } },
    });
    if (!enrollment) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    const targetClass = await prisma.class.findFirst({
      where: { id: params.fields.classId, schoolId: params.schoolId },
    });
    if (!targetClass) return { ok: false, error: "INVALID_CLASS" };
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
```
to:
```ts
export type EditStudentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "NO_ACTIVE_ENROLLMENT" };

export async function editStudent(
  prisma: PrismaClient,
  params: {
    studentId: number;
    schoolId: number;
    academicYearId: number | null;
    fields: {
      name?: string;
      dob?: string;
      admissionNo?: string;
      classId?: number;
      rollNumber?: string;
      photoUrl?: string;
    };
  }
): Promise<EditStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.admissionNo && params.fields.admissionNo !== student.admissionNo) {
    const existing = await prisma.student.findUnique({ where: { admissionNo: params.fields.admissionNo } });
    if (existing) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
  }

  let enrollment: { classId: number } | null = null;
  if (params.fields.classId !== undefined || params.fields.rollNumber !== undefined) {
    if (!params.academicYearId) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId } },
    });
    if (!enrollment) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    if (params.fields.classId !== undefined) {
      const targetClass = await prisma.class.findFirst({
        where: { id: params.fields.classId, schoolId: params.schoolId },
      });
      if (!targetClass) return { ok: false, error: "INVALID_CLASS" };
    }

    if (params.fields.rollNumber) {
      const targetClassId = params.fields.classId ?? enrollment.classId;
      const conflict = await prisma.enrollment.findFirst({
        where: {
          classId: targetClassId,
          academicYearId: params.academicYearId,
          rollNumber: params.fields.rollNumber,
          studentId: { not: params.studentId },
        },
      });
      if (conflict) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    }
  }

  await prisma.$transaction(async (tx) => {
    const data: { name?: string; dob?: Date; admissionNo?: string; photoUrl?: string } = {};
    if (params.fields.name !== undefined) data.name = params.fields.name;
    if (params.fields.dob !== undefined) data.dob = new Date(params.fields.dob);
    if (params.fields.admissionNo !== undefined) data.admissionNo = params.fields.admissionNo;
    if (params.fields.photoUrl !== undefined) data.photoUrl = params.fields.photoUrl;
    if (Object.keys(data).length > 0) {
      await tx.student.update({ where: { id: params.studentId }, data });
    }

    if ((params.fields.classId !== undefined || params.fields.rollNumber !== undefined) && params.academicYearId) {
      const enrollmentData: { classId?: number; rollNumber?: string } = {};
      if (params.fields.classId !== undefined) enrollmentData.classId = params.fields.classId;
      if (params.fields.rollNumber !== undefined) enrollmentData.rollNumber = params.fields.rollNumber;
      await tx.enrollment.update({
        where: {
          studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId },
        },
        data: enrollmentData,
      });
    }
  });

  return { ok: true };
}
```

- [ ] **Step 5: Add the `DUPLICATE_ROLL_NUMBER` → 409 branch to `PATCH /api/students/[id]`**

In `apps/web/src/app/api/students/[id]/route.ts`, change:
```ts
    let body: { name?: string; dob?: string; admissionNo?: string; classId?: number };
```
to:
```ts
    let body: {
      name?: string;
      dob?: string;
      admissionNo?: string;
      classId?: number;
      rollNumber?: string;
      photoUrl?: string;
    };
```

And change:
```ts
      if (result.error === "DUPLICATE_ADMISSION_NO") {
        return NextResponse.json(
          { error: "A student with this admission number already exists" },
          { status: 409 }
        );
      }
      if (result.error === "INVALID_CLASS") {
```
to:
```ts
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
      if (result.error === "INVALID_CLASS") {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/students-api.test.ts`
Expected: PASS (all tests, including the previously-failing 4 and the 4 new ones).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/school-setup/students.ts apps/web/src/app/api/students/route.ts apps/web/src/app/api/students/\[id\]/route.ts apps/web/tests/students-api.test.ts
git commit -m "feat: support roll number and photo on student create/edit"
```

---

### Task 3: Photo upload endpoint

**Files:**
- Create: `apps/web/src/app/api/students/upload-photo/route.ts`
- Test: `apps/web/tests/students-upload-photo-api.test.ts`
- Modify: `apps/web/.gitignore`

**Interfaces:**
- Produces: `POST /api/students/upload-photo` (admin-only), accepting `multipart/form-data` with a `file` field, returning `200 { photoUrl: string }`. Consumed by `StudentsView.tsx` (Task 4).

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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/students-upload-photo-api.test.ts`
Expected: FAIL — the route file doesn't exist.

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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/students-upload-photo-api.test.ts`
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

### Task 4: `StudentsView.tsx` — roll number & photo in create/edit

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx`
- Test: `apps/web/tests/students-view.test.tsx`

**Interfaces:**
- Consumes: `POST /api/students/upload-photo` (Task 3), `POST /api/students` and `PATCH /api/students/:id` (Task 2, both now accept `rollNumber`/`photoUrl`).
- Produces: no new exports — this is the top-level component rendered by `apps/web/src/app/dashboard/students/page.tsx`, which passes `StudentRow[]` (now including `rollNumber`/`photoUrl`) unchanged from `listStudents`'s `StudentSummary[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/students-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentsView } from "../src/components/school-setup/StudentsView";

const students = [
  {
    id: 1,
    name: "Existing Student",
    admissionNo: "SCH-1",
    rollNumber: "5",
    photoUrl: null,
    status: "active" as const,
    class: { name: "Grade 5", section: "A" },
    parents: [],
  },
];
const classes = [{ id: 1, name: "Grade 5", section: "A" }];

describe("StudentsView roll number & photo", () => {
  afterEach(() => cleanup());

  it("shows the roll number column for an existing student", () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("uploads the selected photo first, then includes the returned photoUrl in the create request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ photoUrl: "/uploads/students/abc.png" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 2, name: "New Student", admissionNo: "SCH-2" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(students), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={[]} classes={classes} isAdmin={true} />);

    await userEvent.type(screen.getByLabelText("Student name"), "New Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-2");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Student photo"), file);

    await userEvent.click(screen.getByRole("button", { name: "Create Student" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "/api/students/upload-photo",
        expect.objectContaining({ method: "POST" })
      );
    });
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.photoUrl).toBe("/uploads/students/abc.png");
    expect(secondCallBody.rollNumber).toBe("1");
  });

  it("pre-fills the roll number when starting an edit and submits it on save", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const rollNumberInput = screen.getByLabelText("Edit roll number for Existing Student") as HTMLInputElement;
    expect(rollNumberInput.value).toBe("5");

    await userEvent.clear(rollNumberInput);
    await userEvent.type(rollNumberInput, "9");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/students/1", expect.objectContaining({ method: "PATCH" }));
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.rollNumber).toBe("9");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/students-view.test.tsx`
Expected: FAIL — no "Roll number" label, no "Student photo" label yet.

- [ ] **Step 3: Rewrite `StudentsView.tsx`**

Replace the full contents of `apps/web/src/components/school-setup/StudentsView.tsx`:

```tsx
"use client";

import { Fragment, useState } from "react";

interface StudentRow {
  id: number;
  name: string;
  admissionNo: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: "active" | "left" | "transferred" | "graduated" | "inactive";
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}

async function uploadPhoto(file: File): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/students/upload-photo", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json();
    return { ok: false, error: body.error };
  }
  const body = await response.json();
  return { ok: true, photoUrl: body.photoUrl };
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
  const [rollNumber, setRollNumber] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editAdmissionNo, setEditAdmissionNo] = useState("");
  const [editClassId, setEditClassId] = useState("");
  const [editRollNumber, setEditRollNumber] = useState("");
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/students");
    setStudents(await response.json());
  }

  async function handleCreate() {
    setError(null);

    let photoUrl: string | undefined;
    if (photo) {
      const uploadResult = await uploadPhoto(photo);
      if (!uploadResult.ok) {
        setError(uploadResult.error);
        return;
      }
      photoUrl = uploadResult.photoUrl;
    }

    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        dob,
        classId: classId ? Number(classId) : undefined,
        admissionNo,
        rollNumber: rollNumber || undefined,
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
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(student: StudentRow) {
    setEditingId(student.id);
    setEditName(student.name);
    setEditAdmissionNo(student.admissionNo);
    setEditRollNumber(student.rollNumber ?? "");
    setEditPhoto(null);
    setEditDob("");
    setEditClassId("");
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);

    let photoUrl: string | undefined;
    if (editPhoto) {
      const uploadResult = await uploadPhoto(editPhoto);
      if (!uploadResult.ok) {
        setError(uploadResult.error);
        return;
      }
      photoUrl = uploadResult.photoUrl;
    }

    const body: {
      name: string;
      admissionNo: string;
      dob?: string;
      classId?: number;
      rollNumber?: string;
      photoUrl?: string;
    } = {
      name: editName,
      admissionNo: editAdmissionNo,
    };
    if (editDob) body.dob = editDob;
    if (editClassId) body.classId = Number(editClassId);
    if (editRollNumber) body.rollNumber = editRollNumber;
    if (photoUrl) body.photoUrl = photoUrl;

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

  async function handleActivate(id: number) {
    setError(null);
    const response = await fetch(`/api/students/${id}/activate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  return (
    <div className="mt-4">
      {isAdmin && (
        <div className="flex flex-col gap-2">
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
            type="text"
            aria-label="Roll number"
            value={rollNumber}
            onChange={(event) => setRollNumber(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Roll number (optional)"
          />
          <input
            type="file"
            aria-label="Student photo"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            className="rounded border border-gray-300 px-3 py-2"
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
          <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">
            Create Student
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Admission No.</th>
            <th className="border-b border-gray-200 pb-2">Roll No.</th>
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
                <td className="border-b border-gray-100 py-2">{student.rollNumber ?? "—"}</td>
                <td className="border-b border-gray-100 py-2">
                  {student.class ? `${student.class.name} ${student.class.section}` : "Unassigned"}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {student.parents.map((parent) => `${parent.name} (${parent.phone})`).join(", ") || "None"}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {student.status !== "active" && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">{student.status}</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="border-b border-gray-100 py-2">
                    <button type="button" onClick={() => startEdit(student)} className="mr-3 text-blue-600 underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(student.id)} className="mr-3 text-red-600 underline">
                      Delete
                    </button>
                    {student.status !== "active" && (
                      <button
                        type="button"
                        onClick={() => handleActivate(student.id)}
                        className="text-green-700 underline"
                      >
                        Activate
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {editingId === student.id && (
                <tr>
                  <td colSpan={7} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input
                        type="text"
                        aria-label={`Edit name for ${student.name}`}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <input
                        type="date"
                        aria-label={`Edit date of birth for ${student.name}`}
                        value={editDob}
                        onChange={(event) => setEditDob(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <input
                        type="text"
                        aria-label={`Edit admission number for ${student.name}`}
                        value={editAdmissionNo}
                        onChange={(event) => setEditAdmissionNo(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <input
                        type="text"
                        aria-label={`Edit roll number for ${student.name}`}
                        value={editRollNumber}
                        onChange={(event) => setEditRollNumber(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                        placeholder="Roll number"
                      />
                      <input
                        type="file"
                        aria-label={`Edit photo for ${student.name}`}
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => setEditPhoto(event.target.files?.[0] ?? null)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      {student.class && (
                        <select
                          aria-label={`Edit class for ${student.name}`}
                          value={editClassId}
                          onChange={(event) => setEditClassId(event.target.value)}
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          <option value="">Keep current class</option>
                          {classes.map((klass) => (
                            <option key={klass.id} value={klass.id}>
                              {klass.name} {klass.section}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(student.id)}
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
              {deleteBlockedId === student.id && (
                <tr>
                  <td colSpan={7} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2 text-sm">
                      <span>{student.name} has recorded history and cannot be permanently deleted.</span>
                      <button
                        type="button"
                        onClick={() => handleDeactivate(student.id)}
                        className="rounded bg-amber-600 px-2 py-1 text-white"
                      >
                        Deactivate instead
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/students-view.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/StudentsView.tsx apps/web/tests/students-view.test.tsx
git commit -m "feat: add roll number and photo to StudentsView create/edit"
```

---

### Task 5: Attendance roster — include roll number & photo

**Files:**
- Modify: `apps/web/src/lib/enrollment.ts`
- Modify: `apps/web/src/lib/attendance.ts`
- Modify: `apps/web/tests/attendance-api.test.ts`

**Interfaces:**
- Produces: `EnrolledStudent` (in `enrollment.ts`) gains `rollNumber: string | null; photoUrl: string | null`. `RosterEntry` (in `attendance.ts`) gains the same two fields. Consumed by `AttendanceView.tsx` (Task 10).

- [ ] **Step 1: Update the existing roster-shape assertion test**

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
        rollNumber: null,
        photoUrl: null,
        status: null,
        note: null,
        monthPercent: 0,
      },
    ]);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-api.test.ts -t "returns the roster"`
Expected: FAIL — actual roster entries don't yet have `rollNumber`/`photoUrl` keys.

- [ ] **Step 3: Extend `getEnrolledStudents`**

In `apps/web/src/lib/enrollment.ts`, change:
```ts
export interface EnrolledStudent {
  id: number;
  name: string;
}

export async function getEnrolledStudents(
  prisma: PrismaClient,
  params: { classId: number; academicYearId: number }
): Promise<EnrolledStudent[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId, status: "active" },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });
  return enrollments.map((enrollment) => ({
    id: enrollment.student.id,
    name: enrollment.student.name,
  }));
}
```
to:
```ts
export interface EnrolledStudent {
  id: number;
  name: string;
  rollNumber: string | null;
  photoUrl: string | null;
}

export async function getEnrolledStudents(
  prisma: PrismaClient,
  params: { classId: number; academicYearId: number }
): Promise<EnrolledStudent[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId, status: "active" },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });
  return enrollments.map((enrollment) => ({
    id: enrollment.student.id,
    name: enrollment.student.name,
    rollNumber: enrollment.rollNumber,
    photoUrl: enrollment.student.photoUrl,
  }));
}
```

- [ ] **Step 4: Extend `RosterEntry` and its mapping in `attendance.ts`**

In `apps/web/src/lib/attendance.ts`, change:
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
  rollNumber: string | null;
  photoUrl: string | null;
  status: AttendanceStatus | null;
  note: string | null;
  monthPercent: number;
}
```

And change:
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-api.test.ts`
Expected: PASS (all attendance tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/enrollment.ts apps/web/src/lib/attendance.ts apps/web/tests/attendance-api.test.ts
git commit -m "feat: include rollNumber/photoUrl in the attendance roster"
```

---

### Task 6: `markAttendance` — support a null status as "delete this record"

**Files:**
- Modify: `apps/web/src/lib/attendance.ts`
- Modify: `apps/web/src/app/api/attendance/route.ts`
- Modify: `apps/web/tests/attendance-api.test.ts`

**Interfaces:**
- Produces: `markAttendance`'s `entries[].status` type widens to `"present" | "absent" | "late" | null`. A `null` entry deletes any existing `Attendance` row for that student+date instead of upserting. Consumed by `AttendanceView` (Task 10), which submits every student on every save, including unmarked ones.

- [ ] **Step 1: Write the failing tests**

Append to the `describe("/api/attendance", ...)` block in `apps/web/tests/attendance-api.test.ts` (before its closing `});`):

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
    const { school, year, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const secondStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Second Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-502",
    });
    const thirdStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Third Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-503",
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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-api.test.ts`
Expected: FAIL on the first new test — `markAttendance` currently tries to `upsert` a `null` status, which Prisma rejects.

- [ ] **Step 3: Update `markAttendance` to branch on `null` status**

In `apps/web/src/lib/attendance.ts`, change:
```ts
export async function markAttendance(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    academicYearId: number;
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
    academicYearId: number;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "present" | "absent" | "late" | null; note?: string }>;
  }
): Promise<MarkAttendanceResult> {
```

And change:
```ts
  const targetDate = new Date(params.date);
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

  return { ok: true };
}
```
to:
```ts
  const targetDate = new Date(params.date);
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

  return { ok: true };
}
```

- [ ] **Step 4: Widen the POST route's type cast**

In `apps/web/src/app/api/attendance/route.ts`, change:
```ts
    let entries: Array<{ studentId: number; status: string; note?: string }> | undefined;
```
to:
```ts
    let entries: Array<{ studentId: number; status: string | null; note?: string }> | undefined;
```

And change:
```ts
    const result = await markAttendance(prisma, {
      classId,
      date,
      academicYearId: yearResult.academicYear.id,
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
      academicYearId: yearResult.academicYear.id,
      teacherUserId: claims.userId,
      entries: entries as Array<{
        studentId: number;
        status: "present" | "absent" | "late" | null;
        note?: string;
      }>,
    });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-api.test.ts`
Expected: PASS (all attendance tests, including the 3 new ones).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/attendance.ts apps/web/src/app/api/attendance/route.ts apps/web/tests/attendance-api.test.ts
git commit -m "feat: support unmarking attendance via a null status"
```

---

### Task 7: Shared status-cycling helper

**Files:**
- Create: `apps/web/src/lib/attendance-status.ts`
- Test: `apps/web/tests/attendance-status.test.ts`

**Interfaces:**
- Produces: `type AttendanceStatusValue = "present" | "absent" | "late" | null` and `cycleAttendanceStatus(current: AttendanceStatusValue): AttendanceStatusValue`. Consumed by `AttendanceView` (Task 10).

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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-status.test.ts`
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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/attendance-status.ts apps/web/tests/attendance-status.test.ts
git commit -m "feat: add attendance status cycling helper"
```

---

### Task 8: `StudentAttendanceCard` component

**Files:**
- Create: `apps/web/src/components/attendance/StudentAttendanceCard.tsx`
- Test: `apps/web/tests/student-attendance-card.test.tsx`

**Interfaces:**
- Produces: `StudentAttendanceCard({ name, rollNumber, photoUrl, status, onClick })` where `rollNumber: string | null`, `photoUrl: string | null`, `status: "present" | "absent" | "late" | null`. A presentational button; omits its "Roll No." line when `rollNumber` is `null`. Consumed by `AttendanceReviewPanel` (Task 9) and `AttendanceView` (Task 10).

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

  it("shows the roll number when set", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status={null} onClick={() => {}} />
    );
    expect(screen.getByText("Roll No. 12")).toBeInTheDocument();
  });

  it("omits the roll number line when rollNumber is null", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber={null} photoUrl={null} status={null} onClick={() => {}} />
    );
    expect(screen.queryByText(/Roll No\./)).not.toBeInTheDocument();
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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/student-attendance-card.test.tsx`
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
  rollNumber: string | null;
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
      {rollNumber && <span className="text-[11px] text-neutral-400">Roll No. {rollNumber}</span>}
      <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
        {STATUS_LABEL[key]}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/student-attendance-card.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/attendance/StudentAttendanceCard.tsx apps/web/tests/student-attendance-card.test.tsx
git commit -m "feat: add StudentAttendanceCard component"
```

---

### Task 9: `AttendanceReviewPanel` component

**Files:**
- Create: `apps/web/src/components/attendance/AttendanceReviewPanel.tsx`
- Test: `apps/web/tests/attendance-review-panel.test.tsx`

**Interfaces:**
- Consumes: `StudentAttendanceCard` (Task 8).
- Produces: `AttendanceReviewPanel({ entries, onCycle, onBack, onConfirm })` where `entries: Array<{ studentId: number; name: string; rollNumber: string | null; photoUrl: string | null; status: "present" | "absent" | "late" | null }>`. Consumed by `AttendanceView` (Task 10).

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
    { studentId: 2, name: "Unmarked Student", rollNumber: null, photoUrl: null, status: null },
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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-review-panel.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/attendance/AttendanceReviewPanel.tsx`:

```tsx
"use client";

import { StudentAttendanceCard } from "./StudentAttendanceCard";

export interface ReviewEntry {
  studentId: number;
  name: string;
  rollNumber: string | null;
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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-review-panel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/attendance/AttendanceReviewPanel.tsx apps/web/tests/attendance-review-panel.test.tsx
git commit -m "feat: add AttendanceReviewPanel component"
```

---

### Task 10: Rebuild `AttendanceView` around the card grid

**Files:**
- Modify: `apps/web/src/components/attendance/AttendanceView.tsx` (full rewrite)
- Test: `apps/web/tests/attendance-view.test.tsx`

**Interfaces:**
- Consumes: `StudentAttendanceCard` (Task 8), `AttendanceReviewPanel` (Task 9), `cycleAttendanceStatus`/`AttendanceStatusValue` (Task 7), `GET`/`POST /api/attendance` (Tasks 5-6 — `RosterEntry` now includes `rollNumber`/`photoUrl`, POST accepts `null` statuses).
- Produces: the `AttendanceView` component rendered by `apps/web/src/app/dashboard/attendance/page.tsx` — no prop changes there, still `{ classes, role }`.

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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-view.test.tsx`
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
  rollNumber: string | null;
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

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-view.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the relevant tests to check for regressions**

Run: `cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test_dae667" npx vitest run tests/attendance-api.test.ts tests/students-api.test.ts tests/students-upload-photo-api.test.ts tests/students-view.test.tsx tests/attendance-status.test.ts tests/student-attendance-card.test.tsx tests/attendance-review-panel.test.tsx tests/attendance-view.test.tsx tests/seed.test.ts`
Expected: all PASS. (Per Global Constraints, do not run the full suite and treat `dashboard-overview`/`nav-items`/`scoped-queries` failures as regressions — they're pre-existing and out of scope.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/attendance/AttendanceView.tsx apps/web/tests/attendance-view.test.tsx
git commit -m "feat: rebuild attendance marking as a card grid"
```

---

### Task 11: Manual verification in the browser

Automated tests cover logic and rendering, but not that the real page loads, looks right, and survives a real click-through with a real database.

**Files:** none (verification only).

- [ ] **Step 1: Point the dev server at the dedicated worktree database**

The app's dev database is `school_is` (via `apps/web/.env`), separate from the `school_is_test_dae667` test database used above — no action needed here unless `.env` is missing; if so, copy `apps/web/.env.example` to `apps/web/.env`.

- [ ] **Step 2: Seed the dev database**

Run: `cd apps/web && npm run seed`
Expected: seed script completes without error (uses `createSeedFixtures`, fixed in Task 1).

- [ ] **Step 3: Start the dev server**

Use the `mcp__Claude_Preview__preview_start` tool (or `npm run dev` if that tool is unavailable) to start the `web` app.

- [ ] **Step 4: Log in as the seeded teacher and open Attendance**

The seed fixtures create a teacher with phone `+10000000001` (see `apps/web/prisma/fixtures.ts`). Log in through `/login`, request an OTP, and check the terminal/dev logs for the code (OTP delivery is logged, not actually sent). Navigate to `/dashboard/attendance`.

- [ ] **Step 5: Walk through the full flow**

- Confirm the seeded student ("Rohan Sharma") renders as a card with an initials avatar (no `photoUrl` seeded) and "Roll No. GH-2026-001" (seeded in Task 1).
- Click the card once — it should turn green/"Present". Click again — red/"Absent". Click again — amber/"Late". Click again — back to neutral/"Unmarked".
- Click "Mark All Present" — card turns green.
- Click "Mark All Absent" — card turns red.
- Click "Reset" — card returns to neutral.
- Click "Submit All" — the review panel should open, listing the unmarked student.
- Click the card inside the review panel to cycle it to "Present", confirm it updates live.
- Click "Back" — panel closes, main grid still reflects the change.
- Click "Submit All" again, then "Confirm & Submit" — panel closes, a success message appears.
- Reload the page — the submitted status should still be reflected.
- Separately, visit `/dashboard/students` as admin (seed fixtures create an admin with phone `+10000000002`) and confirm the roll number/photo inputs from Task 4 are present in both the create form and an edit row.

- [ ] **Step 6: Check for console/network errors**

Use `mcp__Claude_Preview__preview_console_logs` (level: `error`) and `mcp__Claude_Preview__preview_network` (filter: `failed`) to confirm no unexpected errors occurred during the walkthrough.

- [ ] **Step 7: Report results**

No commit for this task — report back what was verified (and screenshot if useful) rather than claiming success without having driven the flow.

## Execution Notes

- Tasks 1-2 must run in order (Task 2 depends on Task 1's schema). Task 3 (photo upload) is independent of Task 2 but Task 4 (`StudentsView.tsx`) depends on both Task 2 and Task 3. Tasks 5-6 (attendance roster/mark) depend only on Task 1's schema, not on Tasks 2-4 — they can run in parallel with Tasks 2-4 if using a workflow that supports it, but this plan assumes sequential execution. Tasks 7-8 (status helper, card component) can run in either order but must both complete before Task 9 (`AttendanceReviewPanel`, imports `StudentAttendanceCard`) and Task 10 (`AttendanceView`, imports both plus the status helper, and needs Task 5-6's roster/submit changes).
