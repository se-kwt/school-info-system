# Class Roster + Standalone Faculty Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a Class in the Classes module shows that class's student roster (not Faculty Assignment, which moves to its own module under School Management with a Classes-picker → detail flow).

**Architecture:** Reuse existing, unchanged components (`StudentsView`, `FacultyAssignmentView`) behind new/relocated thin server-component pages. Add one small filter option to an existing lib function (`listStudents`) and one small display-toggle prop to an existing component (`StudentsView`). One new component (`FacultyAssignmentClassesView`), structurally identical to the existing `SubjectsView` picker.

**Tech Stack:** Next.js App Router (React Server Components + client components), Prisma, Vitest + Testing Library.

## Global Constraints

- No changes to any `/api/*` route, `lib/school-setup/classes.ts`, `lib/school-setup/class-teachers.ts`, or `lib/school-setup/staff.ts` — this branch only adds a `classId` filter option to `listStudents` and reuses everything else as-is.
- `FacultyAssignmentView` itself is not modified — only the page that renders it moves.
- Admin-only: every new/moved page uses `requireDashboardRole(["admin"])`, matching the pages being replaced/relocated.
- Follow existing component conventions in `apps/web/src/components/school-setup/`: `PageHeader`, `GridToolbar`, `EntityCard`, `Pagination` for the new listing UI.
- Run tests with `cd apps/web && npm test` (Vitest). All existing tests must stay green; new/changed behavior needs new/updated tests.

---

### Task 1: `listStudents` gains a `classId` filter

**Files:**
- Modify: `apps/web/src/lib/school-setup/students.ts`
- Test: `apps/web/tests/students-lib.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `listStudents(prisma, schoolId, options?)` — `options` gains `classId?: number` alongside the existing `page?`/`pageSize?`. When set, only students with an active-year enrollment in that exact class are returned. `StudentSummary`'s shape is unchanged.

- [ ] **Step 1: Write the failing test**

Add this test to the existing `describe("students.ts scalar fields", ...)` block in `apps/web/tests/students-lib.test.ts` (the file already imports `prisma`, `resetDb` from `./helpers/db` and `createActiveYear`, `createClass`, `createEnrolledStudent` from `./helpers/enrollment`, plus `listStudents` from the lib under test — no new imports needed):

```ts
  it("filters students by classId, matching only that class's active enrollment", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const classA = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 7", section: "A" });
    const classB = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, gradeId: classA.gradeId, section: "B" });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: classA.id,
      academicYearId: year.id,
      name: "Student A",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-200",
    });
    await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: classB.id,
      academicYearId: year.id,
      name: "Student B",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-201",
    });

    const result = await listStudents(prisma, school.id, { classId: classA.id });
    expect(result.map((s) => s.admissionNo)).toEqual(["SCH-200"]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/students-lib.test.ts -t "filters students by classId"`
Expected: FAIL — `listStudents` currently has no `classId` option, so the call returns every student in the school (both SCH-200 and SCH-201), not just SCH-200.

- [ ] **Step 3: Update `listStudents` in `students.ts`**

Change the function signature and the `where` clause of the `prisma.student.findMany` call. Before:

```ts
export async function listStudents(
  prisma: PrismaClient,
  schoolId: number,
  options?: { page?: number; pageSize?: number }
): Promise<StudentSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
```

After:

```ts
export async function listStudents(
  prisma: PrismaClient,
  schoolId: number,
  options?: { page?: number; pageSize?: number; classId?: number }
): Promise<StudentSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });
  const students = await prisma.student.findMany({
    where: {
      schoolId,
      ...(options?.classId
        ? { enrollments: { some: { academicYearId: activeYear?.id ?? -1, classId: options.classId } } }
        : {}),
    },
    include: {
```

Everything else in the function (the `include`, `orderBy`, pagination spread, and the rest of the function body below it) stays exactly as it is.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/students-lib.test.ts`
Expected: all tests in the file PASS, including the new one.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/school-setup/students.ts apps/web/tests/students-lib.test.ts
git commit -m "feat(students): add classId filter to listStudents"
```

---

### Task 2: `StudentsView` gains a `hideClassFilter` prop

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx`
- Test: `apps/web/tests/students-view.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StudentsView`'s props gain `hideClassFilter?: boolean` (default falsy — `/dashboard/students`'s existing behavior is unaffected). When `true`, the "Filter by class" `<select>` is not rendered.

- [ ] **Step 1: Write the failing tests**

Add these two tests to the existing `describe(...)` block in `apps/web/tests/students-view.test.tsx` (the file already has `classes` and `students` fixtures at the top and imports `StudentsView`, `render`, `screen`, `cleanup` — no new imports needed):

```tsx
  it("shows the class filter by default", () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    expect(screen.getByLabelText("Filter by class")).toBeInTheDocument();
  });

  it("hides the class filter when hideClassFilter is set", () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} hideClassFilter />);
    expect(screen.queryByLabelText("Filter by class")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify the second one fails**

Run: `cd apps/web && npx vitest run tests/students-view.test.tsx -t "hides the class filter"`
Expected: FAIL — `StudentsView` doesn't accept `hideClassFilter` yet (TypeScript would also flag the unknown prop), so the select still renders.

- [ ] **Step 3: Update `StudentsView.tsx`**

Change the props destructuring and type (near the top of the file). Before:

```tsx
export function StudentsView({
  initialStudents,
  classes,
  isAdmin,
}: {
  initialStudents: StudentRow[];
  classes: { id: number; gradeName: string; section: string }[];
  isAdmin: boolean;
}) {
```

After:

```tsx
export function StudentsView({
  initialStudents,
  classes,
  isAdmin,
  hideClassFilter,
}: {
  initialStudents: StudentRow[];
  classes: { id: number; gradeName: string; section: string }[];
  isAdmin: boolean;
  hideClassFilter?: boolean;
}) {
```

Then wrap the `<select aria-label="Filter by class" ...>` element in a conditional. Before:

```tsx
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="Filter by class"
          value={classFilter}
          onChange={(event) => handleClassFilterChange(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All classes</option>
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.gradeName} {klass.section}
            </option>
          ))}
        </select>
        {isAdmin && (
```

After:

```tsx
      <div className="flex items-center justify-between gap-3">
        {!hideClassFilter && (
          <select
            aria-label="Filter by class"
            value={classFilter}
            onChange={(event) => handleClassFilterChange(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All classes</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.gradeName} {klass.section}
              </option>
            ))}
          </select>
        )}
        {isAdmin && (
```

The `Link` block right after (`{isAdmin && (<Link href="/dashboard/students/add" ...>Add new student</Link>)}`) and its closing `</div>` stay exactly as they are — only the `<select>` itself gets the new wrapping conditional, and its own closing tag now needs one extra level of indentation/closing `)}` as shown above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/students-view.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/StudentsView.tsx apps/web/tests/students-view.test.tsx
git commit -m "feat(students): add hideClassFilter prop to StudentsView"
```

---

### Task 3: New `FacultyAssignmentClassesView` component — the Classes picker for the Faculty Assignment flow

**Files:**
- Create: `apps/web/src/components/school-setup/FacultyAssignmentClassesView.tsx`
- Test: `apps/web/tests/faculty-assignment-classes-view.test.tsx`

**Interfaces:**
- Consumes: `ClassRow` type exported from `apps/web/src/components/school-setup/ClassesView.tsx` (`{ id: number; gradeId: number; gradeName: string; section: string; academicYearId: number; archived: boolean; capacity?: number | null; room?: string | null; enrolledCount?: number }`, unchanged); `PageHeader`, `GridToolbar`, `EntityCard`, `Pagination` — all from the same directory.
- Produces: `export function FacultyAssignmentClassesView({ initialClasses }: { initialClasses: ClassRow[] })`. Renders one card per class, each titled `` `${gradeName} · Section ${section}` `` and linking to `` `/dashboard/faculty-assignment/${id}` ``, with no create/edit/delete affordances.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/tests/faculty-assignment-classes-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FacultyAssignmentClassesView } from "../src/components/school-setup/FacultyAssignmentClassesView";

const classes = [
  { id: 1, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 1, archived: false, capacity: 30, room: null, enrolledCount: 25 },
  { id: 2, gradeId: 2, gradeName: "Grade 2", section: "B", academicYearId: 1, archived: false, capacity: null, room: null, enrolledCount: 20 },
];

describe("FacultyAssignmentClassesView", () => {
  afterEach(() => cleanup());

  it("renders a card per class linking to its faculty assignment page, with enrollment", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toHaveAttribute(
      "href",
      "/dashboard/faculty-assignment/1"
    );
    expect(screen.getByText("25 / 30")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("does not render an actions menu on class cards", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    await userEvent.type(screen.getByLabelText("Search classes..."), "Section A");
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 2 · Section B" })).not.toBeInTheDocument();
  });

  it("switches to list view and shows the same classes in a table", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Grade 1" })).toBeInTheDocument();
  });

  it("shows an empty state when no classes match the search", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    await userEvent.type(screen.getByLabelText("Search classes..."), "nonexistent");
    expect(screen.getByText("No classes found")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/faculty-assignment-classes-view.test.tsx`
Expected: FAIL with a module-not-found error — `FacultyAssignmentClassesView` doesn't exist yet.

- [ ] **Step 3: Create `FacultyAssignmentClassesView.tsx`**

Create `apps/web/src/components/school-setup/FacultyAssignmentClassesView.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UserCog } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";
import type { ClassRow } from "./ClassesView";

const PAGE_SIZE = 8;

function enrollmentLabel(klass: ClassRow): string | undefined {
  if (klass.enrolledCount === undefined) return undefined;
  return klass.capacity != null ? `${klass.enrolledCount} / ${klass.capacity}` : `${klass.enrolledCount}`;
}

function classTitle(klass: ClassRow): string {
  return `${klass.gradeName} · Section ${klass.section}`;
}

export function FacultyAssignmentClassesView({ initialClasses }: { initialClasses: ClassRow[] }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const filteredClasses = useMemo(
    () => initialClasses.filter((klass) => classTitle(klass).toLowerCase().includes(search.toLowerCase())),
    [initialClasses, search]
  );
  const totalPages = Math.max(1, Math.ceil(filteredClasses.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageClasses = filteredClasses.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={UserCog}
        title="Faculty Assignment"
        subtitle="Select a class to assign teachers to its subjects"
      />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search classes..."
        view={view}
        onViewChange={setView}
      />

      {pageClasses.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No classes found</p>}

      {pageClasses.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageClasses.map((klass) => (
            <EntityCard
              key={klass.id}
              icon={UserCog}
              href={`/dashboard/faculty-assignment/${klass.id}`}
              title={classTitle(klass)}
              subtitle={enrollmentLabel(klass) ?? "No enrollment data"}
              menuItems={[]}
            />
          ))}
        </div>
      )}

      {pageClasses.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Grade</th>
              <th className="border-b border-gray-200 pb-2">Section</th>
            </tr>
          </thead>
          <tbody>
            {pageClasses.map((klass) => (
              <tr key={klass.id}>
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/faculty-assignment/${klass.id}`} className="text-blue-600 underline">
                    {klass.gradeName}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">{klass.section}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={filteredClasses.length}
        onPageChange={setPage}
        itemLabel="classes"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/faculty-assignment-classes-view.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/FacultyAssignmentClassesView.tsx apps/web/tests/faculty-assignment-classes-view.test.tsx
git commit -m "feat(faculty-assignment): add FacultyAssignmentClassesView picker component"
```

---

### Task 4: Wire up the `/dashboard/faculty-assignment/...` route tree and the new nav entry

**Files:**
- Create: `apps/web/src/app/dashboard/faculty-assignment/page.tsx`
- Create: `apps/web/src/app/dashboard/faculty-assignment/[classId]/page.tsx`
- Modify: `apps/web/src/lib/dashboard/nav-items.ts`
- Modify: `apps/web/src/components/dashboard/Sidebar.tsx`
- Test: `apps/web/tests/nav-items.test.ts`, `apps/web/tests/sidebar.test.tsx` (run only — no edits needed)

**Interfaces:**
- Consumes: `FacultyAssignmentClassesView` (Task 3), the unchanged `FacultyAssignmentView` component, `listClasses` from `@/lib/school-setup/classes`, `listSubjects` from `@/lib/school-setup/subjects`, `listClassFaculty` from `@/lib/school-setup/class-teachers`, `listStaff` from `@/lib/school-setup/staff`, `requireDashboardRole`, `prisma`.
- Produces: `getNavSectionsForRole("admin")` now includes, in the "School Management" section, a top-level leaf `{ href: "/dashboard/faculty-assignment", label: "Faculty Assignment", icon: "UserCog" }` after "Academic Calendar". Two new routable pages complete the picker → detail flow.

- [ ] **Step 1: Create `apps/web/src/app/dashboard/faculty-assignment/page.tsx`**

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { FacultyAssignmentClassesView } from "@/components/school-setup/FacultyAssignmentClassesView";

export default async function FacultyAssignmentPage() {
  const claims = await requireDashboardRole(["admin"]);
  const classes = await listClasses(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <FacultyAssignmentClassesView initialClasses={classes} />
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/app/dashboard/faculty-assignment/[classId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listSubjects } from "@/lib/school-setup/subjects";
import { listClassFaculty } from "@/lib/school-setup/class-teachers";
import { listStaff } from "@/lib/school-setup/staff";
import { prisma } from "@/lib/prisma";
import { FacultyAssignmentView } from "@/components/school-setup/FacultyAssignmentView";

export default async function FacultyAssignmentDetailPage(props: { params: Promise<{ classId: string }> }) {
  const params = await props.params;
  const claims = await requireDashboardRole(["admin"]);
  const classId = Number(params.classId);
  if (Number.isNaN(classId)) notFound();

  const klass = await prisma.class.findFirst({
    where: { id: classId, schoolId: claims.schoolId },
    include: { grade: true },
  });
  if (!klass) notFound();

  const [subjectsResult, facultyResult, staff] = await Promise.all([
    listSubjects(prisma, { gradeId: klass.gradeId, schoolId: claims.schoolId }),
    listClassFaculty(prisma, { classId, schoolId: claims.schoolId }),
    listStaff(prisma, claims.schoolId),
  ]);
  const subjects = subjectsResult.ok ? subjectsResult.subjects : [];
  const assignments = facultyResult.ok ? facultyResult.assignments : [];
  const teachers = staff
    .filter((s) => s.role === "teacher" && s.status === "active")
    .map((s) => ({ id: s.id, name: s.name, status: s.status }));

  return (
    <div className="p-6">
      <Link
        href="/dashboard/faculty-assignment"
        className="flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Faculty Assignment
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-gray-800">
        {klass.grade.name} {klass.section} — Faculty
      </h1>
      <FacultyAssignmentView classId={classId} subjects={subjects} teachers={teachers} initialAssignments={assignments} />
    </div>
  );
}
```

- [ ] **Step 3: Add the `UserCog` icon to `nav-items.ts`**

In `apps/web/src/lib/dashboard/nav-items.ts`, add `"UserCog"` to the `IconName` union, right before `"Settings"`:

```ts
export type IconName =
  | "LayoutDashboard"
  | "Layers"
  | "Building2"
  | "BookMarked"
  | "Clock"
  | "CalendarClock"
  | "GraduationCap"
  | "Users"
  | "ClipboardCheck"
  | "BookOpen"
  | "Award"
  | "Wallet"
  | "CalendarRange"
  | "TrendingUp"
  | "CalendarDays"
  | "Bell"
  | "FileBarChart"
  | "UserCog"
  | "Settings";
```

- [ ] **Step 4: Add the nav entry to the "School Management" section**

In the same file's `NAV_TREE`, inside the `"School Management"` section's `items` array, add a new leaf right after the "Academic Calendar" entry. Before:

```ts
      { href: "/dashboard/academic-calendar", label: "Academic Calendar", icon: "CalendarDays", roles: ["admin"] },
    ],
  },
```

After:

```ts
      { href: "/dashboard/academic-calendar", label: "Academic Calendar", icon: "CalendarDays", roles: ["admin"] },
      { href: "/dashboard/faculty-assignment", label: "Faculty Assignment", icon: "UserCog", roles: ["admin"] },
    ],
  },
```

- [ ] **Step 5: Add the `UserCog` icon to `Sidebar.tsx`**

In `apps/web/src/components/dashboard/Sidebar.tsx`, add `UserCog` to the `lucide-react` import list, right before `Settings`:

```ts
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Layers,
  Building2,
  BookMarked,
  Clock,
  CalendarClock,
  GraduationCap,
  Users,
  ClipboardCheck,
  BookOpen,
  Award,
  Wallet,
  CalendarRange,
  TrendingUp,
  CalendarDays,
  Bell,
  FileBarChart,
  UserCog,
  Settings,
} from "lucide-react";
```

And add it to `ICON_MAP`, right before `Settings`:

```ts
const ICON_MAP: Record<IconName, LucideIcon> = {
  LayoutDashboard,
  Layers,
  Building2,
  BookMarked,
  Clock,
  CalendarClock,
  GraduationCap,
  Users,
  ClipboardCheck,
  BookOpen,
  Award,
  Wallet,
  CalendarRange,
  TrendingUp,
  CalendarDays,
  Bell,
  FileBarChart,
  UserCog,
  Settings,
};
```

- [ ] **Step 6: Run the nav test suite to verify it passes**

Run: `cd apps/web && npx vitest run tests/nav-items.test.ts tests/sidebar.test.tsx`
Expected: all tests PASS — the existence check now resolves `/dashboard/faculty-assignment` to the page created in Step 1.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/faculty-assignment apps/web/src/lib/dashboard/nav-items.ts apps/web/src/components/dashboard/Sidebar.tsx
git commit -m "feat(faculty-assignment): wire up the /dashboard/faculty-assignment route tree and nav entry"
```

---

### Task 5: `/dashboard/classes/[id]` now shows the class roster instead of Faculty Assignment

**Files:**
- Modify: `apps/web/src/app/dashboard/classes/[id]/page.tsx` (full content replacement)

**Interfaces:**
- Consumes: `StudentsView` with the Task 2 `hideClassFilter` prop, `listStudents` with the Task 1 `classId` filter, `requireDashboardRole`, `prisma`.
- Produces: no new exports consumed by later tasks (this is the last code task).

- [ ] **Step 1: Replace the file's content**

Replace the entire content of `apps/web/src/app/dashboard/classes/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStudents } from "@/lib/school-setup/students";
import { prisma } from "@/lib/prisma";
import { StudentsView } from "@/components/school-setup/StudentsView";

export default async function ClassDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await requireDashboardRole(["admin"]);
  const classId = Number(params.id);
  if (Number.isNaN(classId)) notFound();

  const klass = await prisma.class.findFirst({
    where: { id: classId, schoolId: claims.schoolId },
    include: { grade: true },
  });
  if (!klass) notFound();

  const students = await listStudents(prisma, claims.schoolId, { classId });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">
        {klass.grade.name} {klass.section} — Students
      </h1>
      <StudentsView
        initialStudents={students}
        classes={[{ id: klass.id, gradeName: klass.grade.name, section: klass.section }]}
        isAdmin={true}
        hideClassFilter
      />
    </div>
  );
}
```

This is a full replacement — the old imports (`listSubjects`, `listClassFaculty`, `listStaff`, `FacultyAssignmentView`) and the old body are gone entirely; that logic now lives at `/dashboard/faculty-assignment/[classId]/page.tsx` (Task 4).

- [ ] **Step 2: Run the full test suite to verify nothing broke**

Run: `cd apps/web && npm test`
Expected: all tests PASS. There is no dedicated test file for this page (matches the existing repo convention — server-component pages like `grades/[id]/page.tsx` or `subjects/[gradeId]/page.tsx` have no direct tests; the client components they render are what's tested), so this step is a regression check on the rest of the suite, not new coverage.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/classes/\[id\]/page.tsx
git commit -m "feat(classes): show the class roster at /dashboard/classes/[id] instead of faculty assignment"
```

---

### Task 6: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and open the dashboard**

Use the project's dev server (`npm run dev` inside `apps/web`, or the harness's preview tooling) logged in as an admin, and navigate to `/dashboard`.

- [ ] **Step 2: Confirm the sidebar**

In the "School Management" section, confirm a new "Faculty Assignment" entry appears after "Academic Calendar". Confirm "Classes" is unchanged.

- [ ] **Step 3: Walk the Faculty Assignment flow**

Click "Faculty Assignment" → confirm a grid of class cards appears (e.g. "Grade 1 · Section A"), each showing enrollment. Click a class → confirm the existing faculty-assignment UI appears (assign a teacher to a subject, confirm it saves), with a "← Faculty Assignment" back link that returns to the picker.

- [ ] **Step 4: Confirm the Classes module now shows the roster**

Go to "Classes" in the sidebar, click a class card → confirm the student roster for that class appears (only students enrolled in that specific class — cross-check against a different class's roster to confirm no leakage), with no "Filter by class" dropdown, but search/add/edit/delete and grid/list toggle all still work.

- [ ] **Step 5: Confirm `/dashboard/students` is unaffected**

Navigate to `/dashboard/students` directly and confirm the "Filter by class" dropdown is still present and working (this page doesn't pass `hideClassFilter`).

No commit for this task — it's verification only. If any step surfaces a bug, fix it in the relevant task's files and re-run that task's tests before re-verifying here.
