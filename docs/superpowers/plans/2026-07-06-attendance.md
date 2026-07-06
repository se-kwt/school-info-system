# Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher mark daily attendance (present/absent/late) for a class they teach, and let both teacher and admin view a class's attendance for any date plus each student's monthly attendance percentage.

**Architecture:** A business-logic module (`src/lib/attendance.ts`) with two functions — `getAttendanceRoster` and `markAttendance` — each embedding its own ownership check (teacher via `ClassTeacher`, admin via `schoolId`) and returning a discriminated-union result, wrapped by a thin API route using the existing `requireApiRole` guard. A single role-aware page (`/dashboard/attendance`) renders an editable form for teachers and a read-only view for admin, following the exact `isAdmin`-conditional pattern already used on the Students page.

**Tech Stack:** Next.js 14 App Router, Prisma, Vitest (existing conventions, no new tooling needed).

## Global Constraints

- No database schema changes — `Attendance`, `Class`, `ClassTeacher`, and `Student` all already exist, including the `@@unique([studentId, date])` constraint on `Attendance`.
- A teacher can mark/view any class they have a `ClassTeacher` row for (any subject) — no "homeroom teacher" restriction.
- Admin is view-only across every class in their own school — `POST /api/attendance` is teacher-only; Admin always gets `403`.
- Re-marking the same class+date is an upsert, not an error — matches the schema's compound unique constraint.
- Monthly percentage formula: `(count of "present" + count of "late") / (count of all marked days that month) × 100`, rounded to the nearest whole number; `0` if no days marked yet that month.
- No parent-facing API and no SMS/WhatsApp absence alerts in this plan — both explicitly deferred.
- Uniqueness/ownership conflicts return a specific status with a clear message — never a raw Prisma error surfaced to the client.

---

### Task 1: Attendance API (roster + mark)

**Files:**
- Create: `apps/web/src/lib/attendance.ts`
- Create: `apps/web/src/app/api/attendance/route.ts`
- Test: `apps/web/tests/attendance-api.test.ts`

**Interfaces:**
- Consumes: `requireApiRole` from `apps/web/src/lib/auth/require-api-role.ts`, `AuthError` from `apps/web/src/lib/auth/rbac.ts`, `SessionClaims` from `apps/web/src/lib/auth/jwt.ts`, `prisma` from `apps/web/src/lib/prisma.ts`.
- Produces: `RosterEntry { studentId: number; name: string; status: "present" | "absent" | "late" | null; note: string | null; monthPercent: number }`, `GetRosterResult = { ok: true; students: RosterEntry[] } | { ok: false; error: "NOT_ASSIGNED" } | { ok: false; error: "INVALID_CLASS" }`, `getAttendanceRoster(prisma, params: { classId: number; date: string; schoolId: number; role: SessionClaims["role"]; userId: number }): Promise<GetRosterResult>`, `MarkAttendanceResult = { ok: true } | { ok: false; error: "NOT_ASSIGNED" } | { ok: false; error: "STUDENT_MISMATCH" }`, `markAttendance(prisma, params: { classId: number; date: string; teacherUserId: number; entries: Array<{ studentId: number; status: "present" | "absent" | "late"; note?: string }> }): Promise<MarkAttendanceResult>` — used by Task 2 (Attendance page, indirectly via the API).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/attendance-api.test.ts`:

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
import { GET as getAttendance, POST as postAttendance } from "../src/app/api/attendance/route";

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
      { studentId: student.id, name: "Test Student", status: null, note: null, monthPercent: 0 },
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

  it("creates attendance records for a fresh mark", async () => {
    const { school, klass, teacher, student } = await seedSchoolWithClassAndTeacher();
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
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
          date: "2026-07-06",
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
    const { school, klass, teacher } = await seedSchoolWithClassAndTeacher();
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
        admissionNo: "SCH-501",
      },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
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
        date: "2026-07-06",
        entries: [{ studentId: student.id, status: "present" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postAttendance(request);
    expect(response.status).toBe(403);
  });

  it("rejects an admin attempting to POST with 403", async () => {
    const { school, klass, student } = await seedSchoolWithClassAndTeacher();
    const admin = await prisma.user.create({
      data: { phone: "+15550006666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        date: "2026-07-06",
        entries: [{ studentId: student.id, status: "present" }],
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/attendance-api.test.ts
```

Expected: FAIL with `Cannot find module '../src/app/api/attendance/route'`

- [ ] **Step 3: Write the business-logic implementation**

`apps/web/src/lib/attendance.ts`:

```ts
import type { PrismaClient, AttendanceStatus } from "@prisma/client";
import type { SessionClaims } from "./auth/jwt";

export interface RosterEntry {
  studentId: number;
  name: string;
  status: AttendanceStatus | null;
  note: string | null;
  monthPercent: number;
}

export type GetRosterResult =
  | { ok: true; students: RosterEntry[] }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "INVALID_CLASS" };

export async function getAttendanceRoster(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    schoolId: number;
    role: SessionClaims["role"];
    userId: number;
  }
): Promise<GetRosterResult> {
  if (params.role === "teacher") {
    const assignment = await prisma.classTeacher.findFirst({
      where: { classId: params.classId, teacherUserId: params.userId },
    });
    if (!assignment) {
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

  const targetDate = new Date(params.date);
  const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

  const students = await prisma.student.findMany({
    where: { classId: params.classId },
    orderBy: { name: "asc" },
    include: {
      attendance: {
        where: { date: { gte: monthStart, lt: monthEnd } },
      },
    },
  });

  const result: RosterEntry[] = students.map((student) => {
    const monthRecords = student.attendance;
    const attendedCount = monthRecords.filter(
      (record) => record.status === "present" || record.status === "late"
    ).length;
    const monthPercent =
      monthRecords.length === 0 ? 0 : Math.round((attendedCount / monthRecords.length) * 100);

    const todayRecord = monthRecords.find(
      (record) => record.date.toISOString().slice(0, 10) === params.date
    );

    return {
      studentId: student.id,
      name: student.name,
      status: todayRecord ? todayRecord.status : null,
      note: todayRecord ? todayRecord.note : null,
      monthPercent,
    };
  });

  return { ok: true, students: result };
}

export type MarkAttendanceResult =
  | { ok: true }
  | { ok: false; error: "NOT_ASSIGNED" }
  | { ok: false; error: "STUDENT_MISMATCH" };

export async function markAttendance(
  prisma: PrismaClient,
  params: {
    classId: number;
    date: string;
    teacherUserId: number;
    entries: Array<{ studentId: number; status: "present" | "absent" | "late"; note?: string }>;
  }
): Promise<MarkAttendanceResult> {
  const assignment = await prisma.classTeacher.findFirst({
    where: { classId: params.classId, teacherUserId: params.teacherUserId },
  });
  if (!assignment) {
    return { ok: false, error: "NOT_ASSIGNED" };
  }

  const studentCount = await prisma.student.count({
    where: {
      classId: params.classId,
      id: { in: params.entries.map((entry) => entry.studentId) },
    },
  });
  if (studentCount !== params.entries.length) {
    return { ok: false, error: "STUDENT_MISMATCH" };
  }

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

- [ ] **Step 4: Write the route**

`apps/web/src/app/api/attendance/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getAttendanceRoster, markAttendance } from "@/lib/attendance";

export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);

    const { searchParams } = new URL(request.url);
    const classIdParam = searchParams.get("classId");
    const date = searchParams.get("date");

    if (!classIdParam || !date) {
      return NextResponse.json({ error: "classId and date are required" }, { status: 400 });
    }
    const classId = Number(classIdParam);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "classId and date are required" }, { status: 400 });
    }

    const result = await getAttendanceRoster(prisma, {
      classId,
      date,
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

    return NextResponse.json({ students: result.students });
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
    let date: string | undefined;
    let entries: Array<{ studentId: number; status: string; note?: string }> | undefined;
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

    if (!result.ok) {
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

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/attendance-api.test.ts
```

Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/lib/attendance.ts apps/web/src/app/api/attendance apps/web/tests/attendance-api.test.ts
git commit -m "Add attendance roster/mark API"
```

---

### Task 2: Attendance page

**Files:**
- Create: `apps/web/src/app/dashboard/attendance/page.tsx` (replaces the Web Dashboard Shell placeholder)
- Create: `apps/web/src/components/attendance/AttendanceView.tsx`

**Interfaces:**
- Consumes: `requireDashboardRole` from `apps/web/src/lib/auth/require-dashboard-role.ts`, `getClassesForTeacher` from `apps/web/src/lib/data/scoped-queries.ts` (Foundation), `listClasses` from `apps/web/src/lib/school-setup/classes.ts` (Admin School Setup), `prisma` from `apps/web/src/lib/prisma.ts`.
- Produces: nothing consumed by later tasks — this is the final task in this plan.

This task has no new automated tests, matching the established pattern for page tasks (Classes/Staff/Students pages in Admin School Setup) — form screens are structurally simple and verified manually in the browser (Step 3).

- [ ] **Step 1: Write the client view component**

`apps/web/src/components/attendance/AttendanceView.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

interface RosterEntry {
  studentId: number;
  name: string;
  status: "present" | "absent" | "late" | null;
  note: string | null;
  monthPercent: number;
}

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
  const [statusEdits, setStatusEdits] = useState<Record<number, "present" | "absent" | "late">>(
    {}
  );
  const [noteEdits, setNoteEdits] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) return;
    setError(null);
    setMessage(null);
    fetch(`/api/attendance?classId=${classId}&date=${date}`).then(async (response) => {
      if (!response.ok) {
        const body = await response.json();
        setError(body.error);
        setStudents([]);
        return;
      }
      const body = await response.json();
      setStudents(body.students);
      const statusMap: Record<number, "present" | "absent" | "late"> = {};
      const noteMap: Record<number, string> = {};
      for (const student of body.students as RosterEntry[]) {
        statusMap[student.studentId] = student.status ?? "present";
        noteMap[student.studentId] = student.note ?? "";
      }
      setStatusEdits(statusMap);
      setNoteEdits(noteMap);
    });
  }, [classId, date]);

  async function handleSave() {
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
          status: statusEdits[student.studentId] ?? "present",
          note: noteEdits[student.studentId] || undefined,
        })),
      }),
    });

    if (response.status === 200) {
      setMessage("Attendance saved");
      const refreshed = await fetch(`/api/attendance?classId=${classId}&date=${date}`);
      const body = await refreshed.json();
      setStudents(body.students);
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
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
          type="date"
          aria-label="Attendance date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Note</th>
            <th className="border-b border-gray-200 pb-2">This Month&apos;s %</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.studentId}>
              <td className="border-b border-gray-100 py-2">{student.name}</td>
              <td className="border-b border-gray-100 py-2">
                {role === "teacher" ? (
                  <select
                    aria-label={`Status for ${student.name}`}
                    value={statusEdits[student.studentId] ?? "present"}
                    onChange={(event) =>
                      setStatusEdits((prev) => ({
                        ...prev,
                        [student.studentId]: event.target.value as "present" | "absent" | "late",
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                  </select>
                ) : (
                  <span>
                    {student.status
                      ? student.status.charAt(0).toUpperCase() + student.status.slice(1)
                      : "—"}
                  </span>
                )}
              </td>
              <td className="border-b border-gray-100 py-2">
                {role === "teacher" ? (
                  <input
                    type="text"
                    aria-label={`Note for ${student.name}`}
                    value={noteEdits[student.studentId] ?? ""}
                    onChange={(event) =>
                      setNoteEdits((prev) => ({
                        ...prev,
                        [student.studentId]: event.target.value,
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1"
                    placeholder="Optional note"
                  />
                ) : (
                  <span>{student.note ?? "—"}</span>
                )}
              </td>
              <td className="border-b border-gray-100 py-2">{student.monthPercent}%</td>
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
          Save Attendance
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder page**

Replace the full contents of `apps/web/src/app/dashboard/attendance/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { AttendanceView } from "@/components/attendance/AttendanceView";

export default async function AttendancePage() {
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
      <h1 className="text-xl font-semibold text-gray-800">Attendance</h1>
      <AttendanceView classes={classes} role={claims.role === "teacher" ? "teacher" : "admin"} />
    </div>
  );
}
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
cd apps/web
npx vitest run
```

Expected: all test files pass (unchanged in count from Task 1 — this task adds no new test file).

- [ ] **Step 4: Manually verify in a browser**

```bash
docker compose up -d
npm run dev
```

Log in as the seeded teacher (phone `+10000000001`, per `prisma/fixtures.ts`, who teaches Grade 5 A) and navigate to `/dashboard/attendance`:
1. Confirm the class dropdown shows "Grade 5 A" and the date defaults to today.
2. Confirm the seeded student ("Rohan Sharma") appears with a "Present" default status.
3. Change one student's status to "Absent," click "Save Attendance," and confirm the success message appears and the status persists after the save.
4. Change the date to a day earlier in the month with no marked attendance and confirm the roster shows "Present" defaults (unmarked) with the correct `monthPercent` reflecting only the one day saved in step 3.

Then log out and log back in as the seeded admin (phone `+10000000002`):
1. Navigate to `/dashboard/attendance` and confirm the class dropdown includes every class in the school (not just one).
2. Select "Grade 5 A" and confirm the status column renders as plain text (e.g. "Absent"), with no dropdown and no "Save Attendance" button.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/app/dashboard/attendance apps/web/src/components/attendance/AttendanceView.tsx
git commit -m "Add attendance page with teacher marking and admin view"
```

---

## Definition of Done

- A teacher can mark present/absent/late for every student in a class they teach, on any date, and re-marking the same class+date updates the existing records rather than erroring or duplicating.
- A teacher attempting to view or mark a class they don't teach gets a `403` with a clear message.
- An admin can view (but not mark) attendance for any class in their own school; a `classId` from a different school is rejected with `400`.
- Each student's monthly attendance percentage is computed correctly (`(present + late) / total marked days × 100`, rounded), independent of whether the currently-viewed date itself has been marked.
- `npx vitest run` passes end-to-end with zero manual setup beyond `docker compose up -d`.
