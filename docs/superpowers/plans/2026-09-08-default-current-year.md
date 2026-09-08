# Default to the Current Academic Year Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard/grades`, `/dashboard/classes`, and `/dashboard/faculty-assignment` default to showing the current (active) academic year's data on first load — the dropdown value AND the initial data must both match — while admins can still switch to another year.

**Architecture:** Server pages resolve the active year (`getActiveAcademicYear`, already exported from `lib/academic-years.ts`) and pass its id into the `academicYearId` option each `list*` function already supports — no lib or API changes. Client components initialize their existing (or, for Faculty Assignment, newly-added) year-filter state from an `academicYears` prop widened to carry `status`, instead of hardcoding `"all"`.

**Tech Stack:** Next.js App Router (React Server Components + client components), Prisma, Vitest + Testing Library.

## Global Constraints

- No changes to `/api/grades`, `/api/classes`, `listGrades`, or `listClasses` — both API routes and both lib functions already accept an `academicYearId` filter option. This plan only threads an already-resolved id into calls that don't pass one yet.
- No changes to `GridToolbar` — its `filterValue`/`onFilterChange`/`filterOptions` props already support everything needed; `GradesView` and `ClassesView` already use them.
- A dropdown's default *value* (component-level, testable) and the *data it's paired with on first paint* (page-level, matched by the server fetch) are two separate fixes that must both land — component tests can only verify the former; there is no test convention in this repo for async server-component pages (confirmed by precedent: no dedicated test exists for `grades/page.tsx`, `classes/page.tsx`, or any other page.tsx in `dashboard/`), so the page-level half is verified by the Task 4 manual browser check, not a unit test.
- Run tests with `cd apps/web && npm test` (Vitest). All existing tests must stay green; new/changed behavior needs new/updated tests.

---

### Task 1: Grades default to the active academic year

**Files:**
- Modify: `apps/web/src/components/school-setup/GradesView.tsx`
- Modify: `apps/web/src/app/dashboard/grades/page.tsx`
- Test: `apps/web/tests/grades-view.test.tsx`

**Interfaces:**
- Consumes: `getActiveAcademicYear(prisma, schoolId): Promise<AcademicYear | null>` from `@/lib/academic-years` (already exported, unchanged).
- Produces: `GradesView`'s local `AcademicYearOption` type now requires `status: "upcoming" | "active" | "archived"` on every entry (the real data already has it — only the type was narrower). No other component's public interface changes.

- [ ] **Step 1: Update the test fixture and add two failing tests**

In `apps/web/tests/grades-view.test.tsx`, change the shared fixture (near the top of the file):

```ts
const academicYears = [{ id: 1, name: "2026-27" }];
```

to:

```ts
const academicYears = [{ id: 1, name: "2026-27", status: "active" as const }];
```

Then add these two tests inside the existing `describe("GradesView", ...)` block:

```tsx
  it("defaults the year filter to the active academic year", () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("1");
  });

  it("falls back to All Years when no academic year is active", () => {
    const noActiveYear = [{ id: 1, name: "2026-27", status: "upcoming" as const }];
    render(<GradesView initialGrades={grades} academicYears={noActiveYear} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("all");
  });
```

- [ ] **Step 2: Run the tests to verify the two new ones fail**

Run: `cd apps/web && npx vitest run tests/grades-view.test.tsx -t "academic year"`
Expected: FAIL — `GradesView`'s `yearFilter` state still hardcodes `"all"`, so both new assertions (`"1"` and, trivially, `"all"` — but for the wrong reason) don't reflect the intended logic yet. The first test is the one that must flip from fail to pass.

- [ ] **Step 3: Update `GradesView.tsx`**

Change the `AcademicYearOption` interface (near the top of the file). Before:

```ts
interface AcademicYearOption {
  id: number;
  name: string;
}
```

After:

```ts
interface AcademicYearOption {
  id: number;
  name: string;
  status: "upcoming" | "active" | "archived";
}
```

Change the `yearFilter` state initializer. Before:

```ts
  const [yearFilter, setYearFilter] = useState("all");
```

After:

```ts
  const [yearFilter, setYearFilter] = useState(() =>
    String(academicYears.find((year) => year.status === "active")?.id ?? "all")
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/grades-view.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Update `grades/page.tsx`**

Before:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listGrades } from "@/lib/school-setup/grades";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { GradesView } from "@/components/school-setup/GradesView";

export default async function GradesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [grades, academicYears] = await Promise.all([
    listGrades(prisma, claims.schoolId),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <GradesView initialGrades={grades} academicYears={academicYears} />
    </div>
  );
}
```

After:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listGrades } from "@/lib/school-setup/grades";
import { listAcademicYears, getActiveAcademicYear } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { GradesView } from "@/components/school-setup/GradesView";

export default async function GradesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const [grades, academicYears] = await Promise.all([
    listGrades(prisma, claims.schoolId, { academicYearId: activeYear?.id }),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <GradesView initialGrades={grades} academicYears={academicYears} />
    </div>
  );
}
```

- [ ] **Step 6: Run the full nav/grades-adjacent test suite to confirm nothing else broke**

Run: `cd apps/web && npx vitest run tests/grades-view.test.tsx tests/grades-lib.test.ts tests/grades-api.test.ts`
Expected: all PASS (no changes to `grades-lib.test.ts` or `grades-api.test.ts` are expected — this step is a regression check since `page.tsx` now calls `getActiveAcademicYear`, which those files don't cover but might be affected by import changes; there is no dedicated test for `page.tsx` itself, per this plan's Global Constraints).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/school-setup/GradesView.tsx apps/web/src/app/dashboard/grades/page.tsx apps/web/tests/grades-view.test.tsx
git commit -m "feat(grades): default the year filter to the active academic year"
```

---

### Task 2: Classes default to the active academic year

**Files:**
- Modify: `apps/web/src/components/school-setup/ClassesView.tsx`
- Modify: `apps/web/src/app/dashboard/classes/page.tsx`
- Test: `apps/web/tests/classes-view.test.tsx`

**Interfaces:**
- Consumes: `getActiveAcademicYear` (same as Task 1).
- Produces: `ClassesView`'s local `AcademicYearOption` type now requires `status`, same shape as Task 1's `GradesView` change.

- [ ] **Step 1: Update the test fixture and add two failing tests**

In `apps/web/tests/classes-view.test.tsx`, change the shared fixture:

```ts
const academicYears = [{ id: 1, name: "2026-27" }];
```

to:

```ts
const academicYears = [{ id: 1, name: "2026-27", status: "active" as const }];
```

Then add these two tests inside the existing `describe("ClassesView", ...)` block:

```tsx
  it("defaults the year filter to the active academic year", () => {
    render(<ClassesView initialClasses={classes} academicYears={academicYears} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("1");
  });

  it("falls back to All Years when no academic year is active", () => {
    const noActiveYear = [{ id: 1, name: "2026-27", status: "upcoming" as const }];
    render(<ClassesView initialClasses={classes} academicYears={noActiveYear} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("all");
  });
```

- [ ] **Step 2: Run the tests to verify the first new one fails**

Run: `cd apps/web && npx vitest run tests/classes-view.test.tsx -t "academic year"`
Expected: FAIL on "defaults the year filter to the active academic year" — `ClassesView`'s `yearFilter` state still hardcodes `"all"`.

- [ ] **Step 3: Update `ClassesView.tsx`**

Change the `AcademicYearOption` interface. Before:

```ts
interface AcademicYearOption {
  id: number;
  name: string;
}
```

After:

```ts
interface AcademicYearOption {
  id: number;
  name: string;
  status: "upcoming" | "active" | "archived";
}
```

Change the `yearFilter` state initializer. Before:

```ts
  const [yearFilter, setYearFilter] = useState("all");
```

After:

```ts
  const [yearFilter, setYearFilter] = useState(() =>
    String(academicYears.find((year) => year.status === "active")?.id ?? "all")
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/classes-view.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Update `classes/page.tsx`**

Before:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { ClassesView } from "@/components/school-setup/ClassesView";

export default async function ClassesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [classes, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId, { includeArchived: true }),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <ClassesView initialClasses={classes} academicYears={academicYears} />
    </div>
  );
}
```

After:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAcademicYears, getActiveAcademicYear } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { ClassesView } from "@/components/school-setup/ClassesView";

export default async function ClassesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const [classes, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId, { includeArchived: true, academicYearId: activeYear?.id }),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <ClassesView initialClasses={classes} academicYears={academicYears} />
    </div>
  );
}
```

- [ ] **Step 6: Run the classes-adjacent test suite to confirm nothing else broke**

Run: `cd apps/web && npx vitest run tests/classes-view.test.tsx tests/classes-lib.test.ts tests/classes-api.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/school-setup/ClassesView.tsx apps/web/src/app/dashboard/classes/page.tsx apps/web/tests/classes-view.test.tsx
git commit -m "feat(classes): default the year filter to the active academic year"
```

---

### Task 3: Faculty Assignment gains a year filter, defaulting to the active academic year

**Files:**
- Modify: `apps/web/src/components/school-setup/FacultyAssignmentClassesView.tsx`
- Modify: `apps/web/src/app/dashboard/faculty-assignment/page.tsx`
- Test: `apps/web/tests/faculty-assignment-classes-view.test.tsx`

**Interfaces:**
- Consumes: `getActiveAcademicYear` (same as Tasks 1-2); the existing `GET /api/classes?academicYearId=...` endpoint (already supports this param, used unchanged).
- Produces: `FacultyAssignmentClassesView`'s `academicYears` prop type gains `status` (same shape as Tasks 1-2). The component gains internal `classes` state (was previously stateless, rendering `initialClasses` directly) so a year-filter change can refetch and update what's shown — this is a new, larger change than Tasks 1-2 since this component had no filter or refresh mechanism at all before this task.

- [ ] **Step 1: Update test fixtures and add failing tests**

In `apps/web/tests/faculty-assignment-classes-view.test.tsx`:

1. Add `vi` to the vitest import (needed for the new mocked-fetch test):

```ts
import { describe, it, expect, afterEach } from "vitest";
```

becomes:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
```

2. Change the shared fixture:

```ts
const academicYears = [{ id: 1, name: "2026-27" }];
```

to:

```ts
const academicYears = [{ id: 1, name: "2026-27", status: "active" as const }];
```

3. In the existing `"distinguishes identically-named grade/section cards from different academic years"` test, change its local `twoYears` fixture:

```ts
    const twoYears = [
      { id: 1, name: "2025-26" },
      { id: 2, name: "2026-27" },
    ];
```

to:

```ts
    const twoYears = [
      { id: 1, name: "2025-26", status: "archived" as const },
      { id: 2, name: "2026-27", status: "active" as const },
    ];
```

4. Add these three new tests inside the existing `describe("FacultyAssignmentClassesView", ...)` block:

```tsx
  it("defaults the year filter to the active academic year", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("1");
  });

  it("falls back to All Years when no academic year is active", () => {
    const noActiveYear = [{ id: 1, name: "2026-27", status: "upcoming" as const }];
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={noActiveYear} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("all");
  });

  it("refetches classes scoped to the selected year when the filter changes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 30,
            gradeId: 1,
            gradeName: "Grade 1",
            section: "C",
            academicYearId: 2,
            archived: false,
            capacity: 30,
            room: null,
            enrolledCount: 5,
          },
        ]),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const twoYears = [
      { id: 1, name: "2025-26", status: "active" as const },
      { id: 2, name: "2026-27", status: "upcoming" as const },
    ];
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={twoYears} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by academic year"), "2");

    expect(fetchMock).toHaveBeenCalledWith("/api/classes?academicYearId=2");
    expect(await screen.findByRole("link", { name: "Grade 1 · Section C" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd apps/web && npx vitest run tests/faculty-assignment-classes-view.test.tsx -t "academic year"`
Expected: FAIL — `FacultyAssignmentClassesView` currently has no `filterValue`/`onFilterChange` on its `GridToolbar` call and no "Filter by academic year" element exists at all, so `getByLabelText("Filter by academic year")` throws.

- [ ] **Step 3: Rewrite `FacultyAssignmentClassesView.tsx`**

Replace the full file content with:

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

interface AcademicYearOption {
  id: number;
  name: string;
  status: "upcoming" | "active" | "archived";
}

const PAGE_SIZE = 8;

function enrollmentLabel(klass: ClassRow): string | undefined {
  if (klass.enrolledCount === undefined) return undefined;
  return klass.capacity != null ? `${klass.enrolledCount} / ${klass.capacity}` : `${klass.enrolledCount}`;
}

function classTitle(klass: ClassRow): string {
  return `${klass.gradeName} · Section ${klass.section}`;
}

export function FacultyAssignmentClassesView({
  initialClasses,
  academicYears,
}: {
  initialClasses: ClassRow[];
  academicYears: AcademicYearOption[];
}) {
  const [classes, setClasses] = useState(initialClasses);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(() =>
    String(academicYears.find((year) => year.status === "active")?.id ?? "all")
  );
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  async function refresh(academicYearIdFilter: string) {
    const params = new URLSearchParams();
    if (academicYearIdFilter !== "all") params.set("academicYearId", academicYearIdFilter);
    const response = await fetch(`/api/classes?${params.toString()}`);
    setClasses(await response.json());
  }

  async function handleYearFilterChange(value: string) {
    setYearFilter(value);
    setPage(1);
    await refresh(value);
  }

  const filteredClasses = useMemo(
    () => classes.filter((klass) => classTitle(klass).toLowerCase().includes(search.toLowerCase())),
    [classes, search]
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
        filterValue={yearFilter}
        onFilterChange={handleYearFilterChange}
        filterOptions={[
          { value: "all", label: "All Years" },
          ...academicYears.map((year) => ({ value: String(year.id), label: year.name })),
        ]}
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
              subtitle={
                academicYears.find((year) => year.id === klass.academicYearId)?.name ?? String(klass.academicYearId)
              }
              tagLine={enrollmentLabel(klass)}
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
              <th className="border-b border-gray-200 pb-2">Year</th>
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
                <td className="border-b border-gray-100 py-2">
                  {academicYears.find((year) => year.id === klass.academicYearId)?.name ?? klass.academicYearId}
                </td>
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

Note what changed from the previous version: `classes` is now `useState(initialClasses)` instead of the component reading `initialClasses` directly; `filteredClasses` derives from `classes` (state) instead of `initialClasses` (prop); a `refresh`/`handleYearFilterChange` pair and `yearFilter` state were added; `GridToolbar` now receives `filterValue`/`onFilterChange`/`filterOptions`. This mirrors `ClassesView.tsx`'s existing `refresh`/`handleYearFilterChange` pattern exactly (that file's `GET /api/classes?includeArchived=true&academicYearId=...` call — this component omits `includeArchived` since it only ever shows non-archived classes, matching its pre-existing behavior).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/faculty-assignment-classes-view.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Update `faculty-assignment/page.tsx`**

Before:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { FacultyAssignmentClassesView } from "@/components/school-setup/FacultyAssignmentClassesView";

export default async function FacultyAssignmentPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [classes, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />
    </div>
  );
}
```

After:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAcademicYears, getActiveAcademicYear } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { FacultyAssignmentClassesView } from "@/components/school-setup/FacultyAssignmentClassesView";

export default async function FacultyAssignmentPage() {
  const claims = await requireDashboardRole(["admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const [classes, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId, { academicYearId: activeYear?.id }),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />
    </div>
  );
}
```

- [ ] **Step 6: Run the full test suite**

Run: `cd apps/web && npm test`
Expected: all PASS except the 6 known pre-existing, unrelated failures in `fee-payments-api.test.ts`/`fees-history.test.ts` (date-sensitive, confirmed unrelated across this branch's history — this task touches no fee/date files).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/school-setup/FacultyAssignmentClassesView.tsx apps/web/src/app/dashboard/faculty-assignment/page.tsx apps/web/tests/faculty-assignment-classes-view.test.tsx
git commit -m "feat(faculty-assignment): add a year filter, defaulting to the active academic year"
```

---

### Task 4: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and open the dashboard**

Use the project's dev server (`npm run dev` inside `apps/web`, or the harness's preview tooling) logged in as an admin. This school's seed data has multiple academic years (confirmed earlier in this session: "All Years", "2027-28", "2026-27", "2025-26" appeared in the Grades year dropdown) — one of them should be `status: "active"`.

- [ ] **Step 2: Verify `/dashboard/grades`**

Navigate to `/dashboard/grades`. Confirm the year dropdown shows the active year selected (not "All Years") on first load, without needing to interact with it first.

- [ ] **Step 3: Verify `/dashboard/classes`**

Navigate to `/dashboard/classes`. Confirm the year dropdown defaults to the active year, AND that the classes listed on first load are only that year's classes (open the dropdown and switch to a different year to confirm the list changes and more/different classes appear — proving the default was actually narrower, not coincidentally showing everything).

- [ ] **Step 4: Verify `/dashboard/faculty-assignment`**

Navigate to `/dashboard/faculty-assignment`. Confirm a year dropdown now exists (it didn't before this plan), defaults to the active year, and the class cards shown are scoped to it. Switch years and confirm the list updates via the network tab or by observing different classes appear (e.g. classes that appeared in the very first version of this page, before any of this plan's changes, if a school has classes in more than one year).

- [ ] **Step 5: Confirm nothing else regressed**

Spot-check `/dashboard/subjects` (unaffected per this plan's scope) and `/dashboard/students` (unaffected) still work as before.

No commit for this task — it's verification only. If any step surfaces a bug, fix it in the relevant task's files and re-run that task's tests before re-verifying here.
