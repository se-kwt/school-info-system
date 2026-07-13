# Teacher Attendance Permission Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict teachers to editing only today's attendance (view-only for other dates), and enable admins to edit attendance for any date — which the API currently blocks entirely.

**Architecture:** Add a role-aware date check to `markAttendance` in `apps/web/src/lib/attendance.ts`, allow `admin` into the POST route's role check, and mirror the same `isEditable` condition client-side in `AttendanceView.tsx` so the UI's editing controls (Mark All, click-to-cycle, Submit All) only render when the action would actually be allowed server-side.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Vitest + Testing Library.

## Global Constraints

- Teachers: can edit only today's date (server UTC day, `new Date().toISOString().slice(0, 10)`); any other date is view-only for them.
- Admins: can edit any date (past, today, or future) — this is new capability since admins currently cannot POST at all.
- No new schema, no persisted "submitted" lock — today's attendance stays editable all day for the teacher.
- The GET roster endpoint is unchanged — both roles can already view any date.

---

### Task 1: Server-side date-lock rule

**Files:**
- Modify: `apps/web/src/lib/attendance.ts`
- Modify: `apps/web/src/app/api/attendance/route.ts`
- Modify: `apps/web/tests/attendance-api.test.ts`

**Interfaces:**
- Consumes: `SessionClaims["role"]` (existing, from `./auth/jwt`).
- Produces: `markAttendance(prisma, { ..., schoolId: number, role: SessionClaims["role"] })` now returns `{ ok: false, error: "DATE_LOCKED" }` when a teacher submits for a non-today date, and scopes the admin class-existence check to `schoolId` (mirroring `getAttendanceRoster`'s existing admin scoping). `MarkAttendanceResult`'s error union gains `"DATE_LOCKED"`.

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/tests/attendance-api.test.ts` entirely with:

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
import { createActiveYear, createEnrolledStudent } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getAttendance, POST as postAttendance } from "../src/app/api/attendance/route";

const today = new Date().toISOString().slice(0, 10);

describe("/api/attendance", () => {
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
    const year = await createActiveYear(prisma, school.id);
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const teacher = await prisma.user.create({
      data: { phone: "+15550001111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    await prisma.classTeacher.create({
      data: { classId: klass.id, teacherUserId: teacher.id, subject: "Math", academicYearId: year.id },
    });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-500",
    });
    return { school, year, klass, teacher, student };
  }

  function loginAs(userId: number, role: "teacher" | "admin", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("returns the roster with null status and 0% for an unmarked day", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    expect(response.status).toBe(200);
    const body = await response.json();
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
  });

  it("rejects a teacher viewing a class they don't teach with 403", async () => {
    const { school, klass } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550002222", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    expect(response.status).toBe(403);
  });

  it("allows admin to view any class in their school", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550003333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.students[0].studentId).toBe(student.id);
  });

  it("rejects a classId from a different school with 400", async () => {
    const { school, teacher } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550004444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${otherClass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing date with 400", async () => {
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(`http://localhost/api/attendance?classId=${klass.id}`);
    const response = await getAttendance(request);
    expect(response.status).toBe(400);
  });

  it("creates attendance records for a fresh mark on today's date", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record).toMatchObject({ status: "present", markedById: teacher.id });
  });

  it("upserts (re-marks) the same class+date without creating a duplicate row", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    async function mark(status: string) {
      const request = new Request("http://localhost/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          classId: klass.id,
          date: today,
          entries: [{ studentId: student.id, status }],
        }),
        headers: { "content-type": "application/json" },
      });
      return postAttendance(request);
    }

    await mark("present");
    const secondResponse = await mark("absent");
    expect(secondResponse.status).toBe(200);

    const records = await prisma.attendance.findMany({ where: { studentId: student.id } });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("absent");
  });

  it("rejects a studentId that doesn't belong to the class with 400", async () => {
    const { school, year, klass, teacher } = await seedSchoolWithClassAndTeacher();
    const otherClass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 6", section: "B" },
    });
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: otherClass.id,
      academicYearId: year.id,
      name: "Other Student",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-501",
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [{ studentId: otherStudent.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(400);

    const records = await prisma.attendance.findMany({ where: { studentId: otherStudent.id } });
    expect(records).toHaveLength(0);
  });

  it("rejects a teacher marking a class they don't own with 403", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const otherTeacher = await prisma.user.create({
      data: { phone: "+15550005555", role: "teacher", name: "Other Teacher", schoolId: school.id },
    });
    loginAs(otherTeacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);
  });

  it("rejects a teacher marking a non-today date with 403", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2020-01-01",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record).toBeNull();
  });

  it("allows admin to mark a non-today (past) date", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550006666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2020-01-01",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(200);

    const record = await prisma.attendance.findFirst({ where: { studentId: student.id } });
    expect(record?.status).toBe("present");
  });

  it("rejects an admin marking a class from a different school with 403", async () => {
    const { school } = await seedSchoolWithClassAndTeacher();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550007777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: otherClass.id,
        date: today,
        entries: [{ studentId: 999999, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);
  });

  it("computes an 80% monthly percentage from 4 attended out of 5 marked days", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    const statuses: Array<"present" | "absent" | "late"> = [
      "present",
      "present",
      "present",
      "absent",
      "late",
    ];
    for (let day = 1; day <= statuses.length; day += 1) {
      await prisma.attendance.create({
        data: {
          studentId: student.id,
          date: new Date(`2026-07-0${day}`),
          status: statuses[day - 1],
          markedById: teacher.id,
        },
      });
    }
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-06`
    );
    const response = await getAttendance(request);
    const body = await response.json();
    expect(body.students[0].monthPercent).toBe(80);
  });

  it("excludes attendance from a different month when computing monthPercent for a date on the 1st", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();

    // Two days in the previous month, both "absent" -- must NOT count toward July's percentage.
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        date: new Date(Date.UTC(2026, 5, 29)), // June 29, 2026
        status: "absent",
        markedById: teacher.id,
      },
    });
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        date: new Date(Date.UTC(2026, 5, 30)), // June 30, 2026
        status: "absent",
        markedById: teacher.id,
      },
    });
    // One day in July, "present" -- should be the ONLY day counted for July's percentage.
    await prisma.attendance.create({
      data: {
        studentId: student.id,
        date: new Date(Date.UTC(2026, 6, 1)), // July 1, 2026
        status: "present",
        markedById: teacher.id,
      },
    });

    loginAs(teacher.id, "teacher", school.id);

    const request = new Request(
      `http://localhost/api/attendance?classId=${klass.id}&date=2026-07-01`
    );
    const response = await getAttendance(request);
    const body = await response.json();

    // If June's 2 absent days leaked into July's window, this would be far below 100.
    expect(body.students[0].monthPercent).toBe(100);
  });

  it("deletes an existing attendance record when the entry status is null", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    await prisma.attendance.create({
      data: { studentId: student.id, date: new Date(today), status: "present", markedById: teacher.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
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
        date: today,
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
      data: { studentId: thirdStudent.id, date: new Date(today), status: "present", markedById: teacher.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: today,
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

    const records = await prisma.attendance.findMany({ where: { date: new Date(today) } });
    expect(records.find((r) => r.studentId === student.id)?.status).toBe("absent");
    expect(records.find((r) => r.studentId === secondStudent.id)?.status).toBe("late");
    expect(records.find((r) => r.studentId === thirdStudent.id)).toBeUndefined();
  });
});
```

Note what changed from the current file: every teacher POST test now uses `today` instead of a hardcoded past date (`"2026-07-06"`), three new tests were added ("rejects a teacher marking a non-today date with 403", "allows admin to mark a non-today (past) date", "rejects an admin marking a class from a different school with 403"), and the old "rejects an admin attempting to POST with 403" test was replaced by "allows admin to mark a non-today (past) date", since admin POST access is now intentional. The GET-only tests (roster/monthPercent ones) are untouched since GET has no date restriction.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/attendance-api.test.ts`
Expected: FAIL — "rejects a teacher marking a non-today date with 403" gets 200 (no lock yet), "allows admin to mark a non-today (past) date" gets 403 (admin still blocked from POST).

- [ ] **Step 3: Implement the date-lock rule**

In `apps/web/src/lib/attendance.ts`, update `MarkAttendanceResult` and `markAttendance`:

```typescript
export type MarkAttendanceResult =
  | { ok: true }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "STUDENT_MISMATCH" }
  | { ok: false; error: "DATE_LOCKED" };

export async function markAttendance(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    academicYearId: number;
    schoolId: number;
    teacherUserId: number;
    role: SessionClaims["role"];
    entries: Array<{ studentId: number; status: "present" | "absent" | "late" | null; note?: string }>;
  }
): Promise<MarkAttendanceResult> {
  if (params.role === "teacher") {
    const today = new Date().toISOString().slice(0, 10);
    if (params.date !== today) {
      return { ok: false, error: "DATE_LOCKED" };
    }

    const assignment = await prisma.classTeacher.findFirst({
      where: {
        classId: params.classId,
        teacherUserId: params.teacherUserId,
        academicYearId: params.academicYearId,
      },
    });
    if (!assignment) return { ok: false, error: "NOT_ASSIGNED" };
  } else {
    const klass = await prisma.class.findFirst({
      where: { id: params.classId, schoolId: params.schoolId },
    });
    if (!klass) return { ok: false, error: "NOT_ASSIGNED" };
  }

  const enrolledCount = await prisma.enrollment.count({
    where: {
      classId: params.classId,
      academicYearId: params.academicYearId,
      status: "active",
      studentId: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (enrolledCount !== params.entries.length) return { ok: false, error: "STUDENT_MISMATCH" };

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

Note: admins have no `ClassTeacher` row, so the assignment check above is branched by role — teachers must be linked via `ClassTeacher`, admins only need the class to exist within their own school (scoped by the new `schoolId` param, mirroring the same check `getAttendanceRoster` already does for admin GET access).

In `apps/web/src/app/api/attendance/route.ts`, change the `POST` handler's role check and pass `role` through to `markAttendance`:

```typescript
export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);

    let classId: number | undefined;
    let date: string | undefined;
    let entries: Array<{ studentId: number; status: string | null; note?: string }> | undefined;
    try {
      ({ classId, date, entries } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || !date || !entries || entries.length === 0) {
      return NextResponse.json(
        { error: "classId, date, and entries are required" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }
    if (yearResult.academicYear.status !== "active") {
      return NextResponse.json(
        { error: "This academic year is archived and no longer accepts changes" },
        { status: 400 }
      );
    }

    const result = await markAttendance(prisma, {
      classId,
      date,
      academicYearId: yearResult.academicYear.id,
      schoolId: claims.schoolId,
      teacherUserId: claims.userId,
      role: claims.role,
      entries: entries as Array<{
        studentId: number;
        status: "present" | "absent" | "late" | null;
        note?: string;
      }>,
    });

    if (!result.ok) {
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      if (result.error === "DATE_LOCKED") {
        return NextResponse.json(
          { error: "Teachers can only edit today's attendance" },
          { status: 403 }
        );
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/attendance-api.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `cd apps/web && npx vitest run`
Expected: all tests PASS (no other test file calls `markAttendance` or the attendance POST route)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/attendance.ts apps/web/src/app/api/attendance/route.ts apps/web/tests/attendance-api.test.ts
git commit -m "Restrict teacher attendance edits to today's date; allow admin edits for any date"
```

---

### Task 2: Client-side isEditable rule

**Files:**
- Modify: `apps/web/src/components/attendance/AttendanceView.tsx`
- Modify: `apps/web/tests/attendance-view.test.tsx`

**Interfaces:**
- No new exports — `AttendanceView`'s prop signature (`classes`, `role`) is unchanged. This task only changes which controls render based on the new `isEditable` condition.

- [ ] **Step 1: Write the failing tests**

In `apps/web/tests/attendance-view.test.tsx`, replace the last test ("does not render bulk actions or Submit All for admin") with the following three tests (admin is now fully editable; a new non-today-teacher case is read-only; today-teacher stays editable, already covered by the earlier tests in this file):

```tsx
  it("renders bulk actions and Submit All for admin on any date", async () => {
    render(<AttendanceView classes={classes} role="admin" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    expect(screen.getByRole("button", { name: "Mark All Present" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit All" })).toBeInTheDocument();
  });

  it("lets admin cycle a card's status", async () => {
    render(<AttendanceView classes={classes} role="admin" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    const card = screen.getByLabelText("Attendance for Asha Verma, currently Unmarked");
    await userEvent.click(card);
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Present")).toBeInTheDocument();
  });

  it("is read-only for a teacher viewing a non-today date", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    const dateInput = screen.getByLabelText("Attendance date");
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, "2020-01-01");

    expect(screen.queryByRole("button", { name: "Mark All Present" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit All" })).not.toBeInTheDocument();

    const card = screen.getByLabelText("Attendance for Asha Verma, currently Unmarked");
    await userEvent.click(card);
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Unmarked")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/attendance-view.test.tsx`
Expected: FAIL — admin still gets no Mark All/Submit All button (current code gates on `role === "teacher"`), and the non-today teacher case still shows editable controls.

- [ ] **Step 3: Implement `isEditable`**

In `apps/web/src/components/attendance/AttendanceView.tsx`, add the computed flag right after the existing state declarations (after the `reviewOpen` state):

```typescript
  const isEditable = role === "admin" || (role === "teacher" && date === todayDateString());
```

Replace the three `role === "teacher"` conditionals with `isEditable`:

```tsx
      {isEditable && (
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
```

```tsx
            onClick={isEditable ? () => cycleStudent(student.studentId) : () => {}}
```

```tsx
      {isEditable && (
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="w-fit self-end rounded-full bg-neutral-900 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Submit All
        </button>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/attendance-view.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `cd apps/web && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Manual verification in the browser**

Start the dev server (`npm run dev` in `apps/web`) and confirm:
- As a teacher, today's date shows Mark All/Submit All and cards respond to clicks; switching the date picker to yesterday hides those controls and clicking a card does nothing.
- As an admin, both today's and a past date's roster show Mark All/Submit All, and edits save successfully via Submit All for a past date.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/attendance/AttendanceView.tsx apps/web/tests/attendance-view.test.tsx
git commit -m "Gate attendance editing controls on isEditable (admin any date, teacher today only)"
```
