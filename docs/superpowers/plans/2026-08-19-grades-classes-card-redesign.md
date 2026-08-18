# Grades & Classes card-grid redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `/dashboard/grades` and `/dashboard/classes` admin pages from plain HTML tables into a card-grid layout (search, academic-year filter, Grid/List toggle, pagination, modal-based create/edit) matching a supplied mockup, using the app's existing fonts/sizes.

**Architecture:** Five new shared presentational components (`PageHeader`, `GridToolbar`, `EntityCard`, `KebabMenu`, `Pagination`) live in `apps/web/src/components/school-setup/` and are consumed by rewritten `GradesView`/`ClassesView` components. List view reuses the existing table markup verbatim. Create/Edit move from inline table rows to the existing `Modal.tsx`. One small additive backend change (`listGrades` gains `academicYearId` scoping + `subjectNames`) and one small Sidebar change (active-route highlighting) round out the work.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind CSS, Prisma 5.20, lucide-react icons, Vitest + Testing Library.

## Global Constraints

- No new fonts — keep the default Tailwind sans stack used everywhere today.
- Reuse the existing type scale (`text-[10px]`/`text-[11px]`/`text-xs`/`text-sm`, `font-semibold`/`font-bold`) and card shape (`rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]`) already used in `KpiCard.tsx`/`StudentCard.tsx`.
- Do not touch `app/dashboard/layout.tsx`'s shared header (no search/bell/avatar added there) — out of scope, confirmed with the user.
- Do not change any existing API error messages, status codes, or the underlying business logic in `lib/school-setup/grades.ts` / `lib/school-setup/classes.ts` beyond the one additive `academicYearId` param on `listGrades`.
- All new components are `"use client"` where they hold state/handlers; keep them framework-idiomatic with the rest of `components/school-setup/`.

---

### Task 1: Sidebar active-route highlighting

**Files:**
- Modify: `apps/web/src/components/dashboard/Sidebar.tsx`
- Test: `apps/web/tests/sidebar.test.tsx`

**Interfaces:**
- Consumes: nothing new (uses `usePathname` from `next/navigation`)
- Produces: nothing consumed by later tasks — this is an isolated visual fix

- [ ] **Step 1: Write the failing tests**

Add a mock for `next/navigation` at the top of the file (before the existing imports) and two new tests, in `apps/web/tests/sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/grades" }));

import { Sidebar } from "../src/components/dashboard/Sidebar";
```

(Replace the existing `import { describe, ... } from "vitest";` and `import { Sidebar } ...` lines with the block above — the `vi.mock` call must come before the `Sidebar` import so Vitest hoists it correctly.)

Then add these two tests at the end of the `describe("Sidebar", ...)` block, after the existing three tests:

```tsx
  it("marks the nav item matching the current pathname as active", () => {
    render(
      <Sidebar
        navItems={[
          { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" as const },
          { href: "/dashboard/grades", label: "Grades", icon: "Layers" as const },
        ]}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
        schoolName="Test School"
        schoolLogoUrl={null}
      />
    );
    expect(screen.getByRole("link", { name: "Grades" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("does not mark a nav item active when the pathname doesn't match", () => {
    render(
      <Sidebar
        navItems={[{ href: "/dashboard/classes", label: "Classes", icon: "Building2" as const }]}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
        schoolName="Test School"
        schoolLogoUrl={null}
      />
    );
    expect(screen.getByRole("link", { name: "Classes" })).not.toHaveAttribute("aria-current");
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- sidebar.test.tsx` (from `apps/web/`)
Expected: the two new tests FAIL (no `aria-current` attribute exists yet); the three pre-existing tests still PASS.

- [ ] **Step 3: Implement active-state highlighting**

In `apps/web/src/components/dashboard/Sidebar.tsx`:

1. Add `usePathname` to the imports:

```tsx
import { usePathname } from "next/navigation";
```

2. Inside the `Sidebar` function body, after `const [collapsed, setCollapsed] = useState(false);`, add:

```tsx
  const pathname = usePathname();

  function isActive(href: string): boolean {
    return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
  }
```

3. Replace the static `navLinkClass` string with a function:

```tsx
  function navLinkClass(active: boolean): string {
    return `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
      active
        ? "bg-indigo-50 text-indigo-700"
        : "text-neutral-500 hover:bg-[#EAECF0]/30 hover:text-neutral-800"
    }`;
  }
```

4. Update both `navItems.map` and `workspaceItems.map` blocks (the two `<ul>` sections under "Main Menu" and "Workspace") to compute and use the active state. For each, change:

```tsx
                <li key={item.href}>
                  <Link href={item.href} className={navLinkClass} title={collapsed ? item.label : undefined}>
                    <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
```

to:

```tsx
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={navLinkClass(isActive(item.href))}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive(item.href) ? "text-indigo-600" : "text-neutral-400"}`} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
```

(Apply this same change to both the `navItems.map` block and the `workspaceItems.map` block — they are identical in structure. The `pinnedClasses` list is left untouched; it doesn't represent a single "current page".)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- sidebar.test.tsx` (from `apps/web/`)
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/Sidebar.tsx apps/web/tests/sidebar.test.tsx
git commit -m "feat: highlight the active nav item in the dashboard sidebar"
```

---

### Task 2: `listGrades` gains academic-year scoping and subject names

**Files:**
- Modify: `apps/web/src/lib/school-setup/grades.ts`
- Test: `apps/web/tests/grades-lib.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `GradeSummary` now includes `subjectNames: string[]`; `listGrades(prisma, schoolId, options?: { academicYearId?: number })` — later tasks (3, 9) call it with this new optional third argument and read `subjectNames` off the result.

- [ ] **Step 1: Write the failing tests**

In `apps/web/tests/grades-lib.test.ts`, replace the existing `"creates and lists grades"` test (it currently asserts an exact object shape that will change) with:

```ts
  it("creates and lists grades", async () => {
    const created = await createGrade(prisma, schoolId, { name: "Grade 1" });
    expect(created.ok).toBe(true);

    const grades = await listGrades(prisma, schoolId);
    expect(grades).toEqual([
      { id: expect.any(Number), name: "Grade 1", subjectCount: 0, classCount: 0, subjectNames: [] },
    ]);
  });

  it("includes subject names in listGrades", async () => {
    const created = await createGrade(prisma, schoolId, { name: "Grade 1" });
    if (!created.ok) throw new Error("setup failed");
    await prisma.subject.create({ data: { gradeId: created.grade.id, name: "Science" } });
    await prisma.subject.create({ data: { gradeId: created.grade.id, name: "Art" } });

    const grades = await listGrades(prisma, schoolId);
    expect(grades[0].subjectNames).toEqual(["Art", "Science"]);
  });

  it("scopes classCount to the given academic year", async () => {
    const created = await createGrade(prisma, schoolId, { name: "Grade 1" });
    if (!created.ok) throw new Error("setup failed");
    const yearA = await prisma.academicYear.create({
      data: { schoolId, name: "2025-26", startDate: new Date("2025-06-01"), endDate: new Date("2026-04-30"), status: "archived" },
    });
    const yearB = await prisma.academicYear.create({
      data: { schoolId, name: "2026-27", startDate: new Date("2026-06-01"), endDate: new Date("2027-04-30"), status: "active" },
    });
    await prisma.class.create({ data: { schoolId, section: "A", gradeId: created.grade.id, academicYearId: yearA.id } });
    await prisma.class.create({ data: { schoolId, section: "A", gradeId: created.grade.id, academicYearId: yearB.id } });
    await prisma.class.create({ data: { schoolId, section: "B", gradeId: created.grade.id, academicYearId: yearB.id } });

    const allTime = await listGrades(prisma, schoolId);
    expect(allTime[0].classCount).toBe(3);

    const scopedToB = await listGrades(prisma, schoolId, { academicYearId: yearB.id });
    expect(scopedToB[0].classCount).toBe(2);

    const scopedToA = await listGrades(prisma, schoolId, { academicYearId: yearA.id });
    expect(scopedToA[0].classCount).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- grades-lib.test.ts` (from `apps/web/`)
Expected: `"creates and lists grades"` FAILs (missing `subjectNames` key), and the two new tests FAIL (`subjectNames` is `undefined`, `academicYearId` option has no effect yet).

- [ ] **Step 3: Implement**

In `apps/web/src/lib/school-setup/grades.ts`, replace the `GradeSummary` interface and `listGrades` function with:

```ts
export interface GradeSummary {
  id: number;
  name: string;
  subjectCount: number;
  classCount: number;
  subjectNames: string[];
}

export async function listGrades(
  prisma: PrismaClient,
  schoolId: number,
  options?: { academicYearId?: number }
): Promise<GradeSummary[]> {
  const grades = await prisma.grade.findMany({
    where: { schoolId },
    include: {
      _count: {
        select: {
          subjects: true,
          classes: options?.academicYearId ? { where: { academicYearId: options.academicYearId } } : true,
        },
      },
      subjects: { select: { name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  return grades.map((grade) => ({
    id: grade.id,
    name: grade.name,
    subjectCount: grade._count.subjects,
    classCount: grade._count.classes,
    subjectNames: grade.subjects.map((subject) => subject.name),
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- grades-lib.test.ts` (from `apps/web/`)
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/school-setup/grades.ts apps/web/tests/grades-lib.test.ts
git commit -m "feat: scope grade classCount by academic year and include subject names"
```

---

### Task 3: Wire `academicYearId` into `GET /api/grades`

**Files:**
- Modify: `apps/web/src/app/api/grades/route.ts`
- Create: `apps/web/tests/grades-api.test.ts`

**Interfaces:**
- Consumes: `listGrades(prisma, schoolId, options?)` from Task 2
- Produces: `GET /api/grades?academicYearId=<id>` — consumed by `GradesView` in Task 9

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/grades-api.test.ts`:

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
import { GET as getGrades } from "../src/app/api/grades/route";

describe("/api/grades", () => {
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
      data: { phone: "+15551230000", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("scopes classCount to the requested academic year", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 1" } });
    const yearA = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2025-26", startDate: new Date("2025-06-01"), endDate: new Date("2026-04-30"), status: "archived" },
    });
    const yearB = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-06-01"), endDate: new Date("2027-04-30"), status: "active" },
    });
    await prisma.class.create({ data: { schoolId: school.id, section: "A", gradeId: grade.id, academicYearId: yearA.id } });
    await prisma.class.create({ data: { schoolId: school.id, section: "A", gradeId: grade.id, academicYearId: yearB.id } });

    const allTimeResponse = await getGrades(new Request("http://localhost/api/grades"));
    const allTime = await allTimeResponse.json();
    expect(allTime[0].classCount).toBe(2);

    const scopedResponse = await getGrades(new Request(`http://localhost/api/grades?academicYearId=${yearB.id}`));
    const scoped = await scopedResponse.json();
    expect(scoped[0].classCount).toBe(1);
  });

  it("rejects an unauthenticated request with 401", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const response = await getGrades(new Request("http://localhost/api/grades"));
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- grades-api.test.ts` (from `apps/web/`)
Expected: FAIL on the first test — `scoped[0].classCount` is `2`, not `1`, because the route doesn't read `academicYearId` yet.

- [ ] **Step 3: Implement**

In `apps/web/src/app/api/grades/route.ts`, replace the `GET` function with:

```ts
export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["admin", "teacher"]);
    const { searchParams } = new URL(request.url);
    const academicYearIdParam = searchParams.get("academicYearId");
    const grades = await listGrades(prisma, claims.schoolId, {
      academicYearId: academicYearIdParam ? Number(academicYearIdParam) : undefined,
    });
    return NextResponse.json(grades);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- grades-api.test.ts` (from `apps/web/`)
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/grades/route.ts apps/web/tests/grades-api.test.ts
git commit -m "feat: support filtering GET /api/grades by academicYearId"
```

---

### Task 4: `Pagination` component

**Files:**
- Create: `apps/web/src/components/school-setup/Pagination.tsx`
- Test: `apps/web/tests/pagination.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `Pagination({ page: number; pageSize: number; total: number; onPageChange: (page: number) => void; itemLabel: string })` — consumed by `GradesView` and `ClassesView` in Tasks 9 and 10.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/pagination.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "../src/components/school-setup/Pagination";

describe("Pagination", () => {
  afterEach(() => cleanup());

  it("shows the current range and total", () => {
    render(<Pagination page={1} pageSize={8} total={11} onPageChange={vi.fn()} itemLabel="grades" />);
    expect(screen.getByText("Showing 1 to 8 of 11 grades")).toBeInTheDocument();
  });

  it("disables the previous button on the first page", () => {
    render(<Pagination page={1} pageSize={8} total={11} onPageChange={vi.fn()} itemLabel="grades" />);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).not.toBeDisabled();
  });

  it("disables the next button on the last page", () => {
    render(<Pagination page={2} pageSize={8} total={11} onPageChange={vi.fn()} itemLabel="grades" />);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).not.toBeDisabled();
  });

  it("calls onPageChange with the next page number", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={8} total={11} onPageChange={onPageChange} itemLabel="grades" />);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pagination.test.tsx` (from `apps/web/`)
Expected: FAIL — the module `../src/components/school-setup/Pagination` does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/school-setup/Pagination.tsx`:

```tsx
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  itemLabel,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between text-xs text-neutral-500">
      <p>{total === 0 ? `No ${itemLabel}` : `Showing ${start} to ${end} of ${total} ${itemLabel}`}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-40"
        >
          ‹
        </button>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-[11px] font-semibold text-white">
          {page}
        </span>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-40"
        >
          ›
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pagination.test.tsx` (from `apps/web/`)
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/Pagination.tsx apps/web/tests/pagination.test.tsx
git commit -m "feat: add Pagination component for card-grid views"
```

---

### Task 5: `KebabMenu` component

**Files:**
- Create: `apps/web/src/components/school-setup/KebabMenu.tsx`
- Test: `apps/web/tests/kebab-menu.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `KebabMenuItem { label: string; onClick: () => void; destructive?: boolean }` and `KebabMenu({ label: string; items: KebabMenuItem[] })` — both consumed by `EntityCard` in Task 8.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kebab-menu.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KebabMenu } from "../src/components/school-setup/KebabMenu";

describe("KebabMenu", () => {
  afterEach(() => cleanup());

  it("shows menu items only after the trigger is clicked", async () => {
    render(<KebabMenu label="Actions for Grade 1" items={[{ label: "Delete", onClick: vi.fn(), destructive: true }]} />);
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Grade 1" }));
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls the item's onClick and closes the menu", async () => {
    const onClick = vi.fn();
    render(<KebabMenu label="Actions for Grade 1" items={[{ label: "Delete", onClick }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Grade 1" }));
    await userEvent.click(screen.getByText("Delete"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside", async () => {
    render(
      <div>
        <KebabMenu label="Actions for Grade 1" items={[{ label: "Delete", onClick: vi.fn() }]} />
        <button type="button">Outside</button>
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for Grade 1" }));
    expect(screen.getByText("Delete")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- kebab-menu.test.tsx` (from `apps/web/`)
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/school-setup/KebabMenu.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export function KebabMenu({ label, items }: { label: string; items: KebabMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs font-medium ${
                item.destructive ? "text-red-600 hover:bg-red-50" : "text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- kebab-menu.test.tsx` (from `apps/web/`)
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/KebabMenu.tsx apps/web/tests/kebab-menu.test.tsx
git commit -m "feat: add KebabMenu component for card actions"
```

---

### Task 6: `PageHeader` component

**Files:**
- Create: `apps/web/src/components/school-setup/PageHeader.tsx`
- Test: `apps/web/tests/page-header.test.tsx`

**Interfaces:**
- Consumes: nothing (takes a `LucideIcon` component as a prop)
- Produces: `PageHeader({ icon: LucideIcon; title: string; subtitle: string; action?: React.ReactNode })` — consumed by `GradesView`/`ClassesView` in Tasks 9 and 10.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/page-header.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Layers } from "lucide-react";
import { PageHeader } from "../src/components/school-setup/PageHeader";

describe("PageHeader", () => {
  afterEach(() => cleanup());

  it("renders the icon, title, subtitle, and action", () => {
    render(
      <PageHeader
        icon={Layers}
        title="Grades"
        subtitle="Manage and organize all grades in your school"
        action={<button type="button">+ Create Grade</button>}
      />
    );
    expect(screen.getByRole("heading", { name: "Grades" })).toBeInTheDocument();
    expect(screen.getByText("Manage and organize all grades in your school")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create Grade" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- page-header.test.tsx` (from `apps/web/`)
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/school-setup/PageHeader.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold text-neutral-900">{title}</h1>
          <p className="text-xs text-neutral-400">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- page-header.test.tsx` (from `apps/web/`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/PageHeader.tsx apps/web/tests/page-header.test.tsx
git commit -m "feat: add PageHeader component"
```

---

### Task 7: `GridToolbar` component

**Files:**
- Create: `apps/web/src/components/school-setup/GridToolbar.tsx`
- Test: `apps/web/tests/grid-toolbar.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `GridToolbar({ searchValue, onSearchChange, searchLabel, filterValue, onFilterChange, filterOptions, view, onViewChange })` — consumed by `GradesView`/`ClassesView` in Tasks 9 and 10.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/grid-toolbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GridToolbar } from "../src/components/school-setup/GridToolbar";

const filterOptions = [
  { value: "all", label: "All Years" },
  { value: "1", label: "2026-27" },
];

describe("GridToolbar", () => {
  afterEach(() => cleanup());

  it("calls onSearchChange as the user types", async () => {
    const onSearchChange = vi.fn();
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={onSearchChange}
        searchLabel="Search grades..."
        filterValue="all"
        onFilterChange={vi.fn()}
        filterOptions={filterOptions}
        view="grid"
        onViewChange={vi.fn()}
      />
    );
    await userEvent.type(screen.getByLabelText("Search grades..."), "G");
    expect(onSearchChange).toHaveBeenCalledWith("G");
  });

  it("calls onFilterChange when a different year is selected", async () => {
    const onFilterChange = vi.fn();
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={vi.fn()}
        searchLabel="Search grades..."
        filterValue="all"
        onFilterChange={onFilterChange}
        filterOptions={filterOptions}
        view="grid"
        onViewChange={vi.fn()}
      />
    );
    await userEvent.selectOptions(screen.getByLabelText("Filter by academic year"), "1");
    expect(onFilterChange).toHaveBeenCalledWith("1");
  });

  it("calls onViewChange when the List button is clicked", async () => {
    const onViewChange = vi.fn();
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={vi.fn()}
        searchLabel="Search grades..."
        filterValue="all"
        onFilterChange={vi.fn()}
        filterOptions={filterOptions}
        view="grid"
        onViewChange={onViewChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(onViewChange).toHaveBeenCalledWith("list");
  });

  it("marks the active view button with aria-pressed", () => {
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={vi.fn()}
        searchLabel="Search grades..."
        filterValue="all"
        onFilterChange={vi.fn()}
        filterOptions={filterOptions}
        view="list"
        onViewChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "false");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- grid-toolbar.test.tsx` (from `apps/web/`)
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/school-setup/GridToolbar.tsx`:

```tsx
"use client";

import { Search, LayoutGrid, List } from "lucide-react";

export function GridToolbar({
  searchValue,
  onSearchChange,
  searchLabel,
  filterValue,
  onFilterChange,
  filterOptions,
  view,
  onViewChange,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: { value: string; label: string }[];
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            aria-label={searchLabel}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchLabel}
            className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          aria-label="Filter by academic year"
          value={filterValue}
          onChange={(event) => onFilterChange(event.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
        >
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-1">
        <button
          type="button"
          aria-label="Grid view"
          aria-pressed={view === "grid"}
          onClick={() => onViewChange("grid")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
            view === "grid" ? "bg-neutral-900 text-white" : "text-neutral-500"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Grid
        </button>
        <button
          type="button"
          aria-label="List view"
          aria-pressed={view === "list"}
          onClick={() => onViewChange("list")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
            view === "list" ? "bg-neutral-900 text-white" : "text-neutral-500"
          }`}
        >
          <List className="h-3.5 w-3.5" /> List
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- grid-toolbar.test.tsx` (from `apps/web/`)
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/GridToolbar.tsx apps/web/tests/grid-toolbar.test.tsx
git commit -m "feat: add GridToolbar component (search, filter, view toggle)"
```

---

### Task 8: `EntityCard` component

**Files:**
- Create: `apps/web/src/components/school-setup/EntityCard.tsx`
- Test: `apps/web/tests/entity-card.test.tsx`

**Interfaces:**
- Consumes: `KebabMenu`, `KebabMenuItem` from Task 5
- Produces: `EntityCard({ icon: LucideIcon; href: string; title: string; subtitle: string; tagLine?: string; footerBadge?: string; onEdit: () => void; menuItems: KebabMenuItem[]; blockedMessage?: string; blockedActions?: React.ReactNode })` — consumed by `GradesView`/`ClassesView` in Tasks 9 and 10.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/entity-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Layers } from "lucide-react";
import { EntityCard } from "../src/components/school-setup/EntityCard";

describe("EntityCard", () => {
  afterEach(() => cleanup());

  it("renders title as a link, subtitle, tagLine, and footer badge", () => {
    render(
      <EntityCard
        icon={Layers}
        href="/dashboard/grades/1"
        title="Grade 1"
        subtitle="6 Subjects • 2 Classes"
        tagLine="English, Math, Science"
        footerBadge="Classes 2"
        onEdit={vi.fn()}
        menuItems={[]}
      />
    );
    expect(screen.getByRole("link", { name: "Grade 1" })).toHaveAttribute("href", "/dashboard/grades/1");
    expect(screen.getByText("6 Subjects • 2 Classes")).toBeInTheDocument();
    expect(screen.getByText("English, Math, Science")).toBeInTheDocument();
    expect(screen.getByText("Classes 2")).toBeInTheDocument();
  });

  it("calls onEdit when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(
      <EntityCard
        icon={Layers}
        href="/dashboard/grades/1"
        title="Grade 1"
        subtitle="6 Subjects • 2 Classes"
        onEdit={onEdit}
        menuItems={[]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("shows the blocked banner instead of the footer when blockedMessage is set", () => {
    render(
      <EntityCard
        icon={Layers}
        href="/dashboard/grades/1"
        title="Grade 1"
        subtitle="6 Subjects • 2 Classes"
        footerBadge="Classes 2"
        onEdit={vi.fn()}
        menuItems={[]}
        blockedMessage="Grade 1 has subjects or classes and cannot be deleted."
        blockedActions={<button type="button">Cancel</button>}
      />
    );
    expect(screen.getByText("Grade 1 has subjects or classes and cannot be deleted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByText("Classes 2")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entity-card.test.tsx` (from `apps/web/`)
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/school-setup/EntityCard.tsx`:

```tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { KebabMenu, type KebabMenuItem } from "./KebabMenu";

export function EntityCard({
  icon: Icon,
  href,
  title,
  subtitle,
  tagLine,
  footerBadge,
  onEdit,
  menuItems,
  blockedMessage,
  blockedActions,
}: {
  icon: LucideIcon;
  href: string;
  title: string;
  subtitle: string;
  tagLine?: string;
  footerBadge?: string;
  onEdit: () => void;
  menuItems: KebabMenuItem[];
  blockedMessage?: string;
  blockedActions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </span>
        <KebabMenu label={`Actions for ${title}`} items={menuItems} />
      </div>
      <div>
        <Link href={href} className="text-sm font-bold text-neutral-900 hover:underline">
          {title}
        </Link>
        <p className="text-[11px] text-neutral-400">{subtitle}</p>
      </div>
      {tagLine && <p className="line-clamp-1 text-[11px] text-neutral-500">{tagLine}</p>}

      {blockedMessage ? (
        <div className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          <p>{blockedMessage}</p>
          <div className="mt-1.5 flex gap-2">{blockedActions}</div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          {footerBadge ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
              {footerBadge}
            </span>
          ) : (
            <span />
          )}
          <button type="button" onClick={onEdit} className="text-xs font-semibold text-indigo-600 hover:underline">
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- entity-card.test.tsx` (from `apps/web/`)
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/EntityCard.tsx apps/web/tests/entity-card.test.tsx
git commit -m "feat: add EntityCard component for grade/class grids"
```

---

### Task 9: Rewrite `GradesView` and `grades/page.tsx`

**Files:**
- Modify: `apps/web/src/components/school-setup/GradesView.tsx` (full rewrite)
- Modify: `apps/web/src/app/dashboard/grades/page.tsx`
- Create: `apps/web/tests/grades-view.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` (Task 6), `GridToolbar` (Task 7), `EntityCard` + `KebabMenuItem` (Tasks 8/5), `Pagination` (Task 4), `Modal` (existing), `GradeSummary`/`listGrades` (Task 2), `listAcademicYears` (existing, `apps/web/src/lib/academic-years.ts`)
- Produces: `GradesView({ initialGrades: GradeRow[]; academicYears: { id: number; name: string }[] })` where `GradeRow = { id: number; name: string; subjectCount: number; classCount: number; subjectNames: string[] }` — this is the last task touching Grades; nothing downstream depends on it.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/grades-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradesView } from "../src/components/school-setup/GradesView";

const academicYears = [{ id: 1, name: "2026-27" }];

const grades = [
  { id: 1, name: "Grade 1", subjectCount: 2, classCount: 2, subjectNames: ["English", "Math"] },
  { id: 2, name: "Grade 2", subjectCount: 0, classCount: 0, subjectNames: [] },
];

describe("GradesView", () => {
  afterEach(() => cleanup());

  it("renders a card per grade with subject names and class count badge", () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "Grade 1" })).toBeInTheDocument();
    expect(screen.getByText("English, Math")).toBeInTheDocument();
    expect(screen.getByText("No subjects yet")).toBeInTheDocument();
    expect(screen.getByText("Classes 2")).toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Search grades..."), "Grade 1");
    expect(screen.getByRole("link", { name: "Grade 1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 2" })).not.toBeInTheDocument();
  });

  it("creates a grade through the modal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 3, name: "Grade 3" }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([...grades, { id: 3, name: "Grade 3", subjectCount: 0, classCount: 0, subjectNames: [] }]), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Create Grade" }));
    await userEvent.type(screen.getByLabelText("Grade name"), "Grade 3");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("link", { name: "Grade 3" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows the delete-blocked banner in place of the footer on a 400 deletable:false response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "This grade has subjects or classes and cannot be deleted", deletable: false }), {
        status: 400,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    const grade1Card = screen.getByRole("link", { name: "Grade 1" }).closest("div")!.parentElement!;
    await userEvent.click(within(grade1Card).getByRole("button", { name: "Actions for Grade 1" }));
    await userEvent.click(within(grade1Card).getByText("Delete"));

    expect(
      await within(grade1Card).findByText("Grade 1 has subjects or classes and cannot be deleted.")
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("switches to list view and shows the same grades in a table", async () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Grade 1" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- grades-view.test.tsx` (from `apps/web/`)
Expected: FAIL — `GradesView` doesn't accept an `academicYears` prop yet and has no card/modal/list-view markup.

- [ ] **Step 3: Implement**

Replace the entire contents of `apps/web/src/components/school-setup/GradesView.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Modal } from "./Modal";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";

export interface GradeRow {
  id: number;
  name: string;
  subjectCount: number;
  classCount: number;
  subjectNames: string[];
}

interface AcademicYearOption {
  id: number;
  name: string;
}

type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;

const PAGE_SIZE = 8;

export function GradesView({
  initialGrades,
  academicYears,
}: {
  initialGrades: GradeRow[];
  academicYears: AcademicYearOption[];
}) {
  const [grades, setGrades] = useState(initialGrades);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh(academicYearId: string) {
    const query = academicYearId !== "all" ? `?academicYearId=${academicYearId}` : "";
    const response = await fetch(`/api/grades${query}`);
    setGrades(await response.json());
  }

  function openCreate() {
    setModalState({ mode: "create" });
    setName("");
    setError(null);
  }

  function openEdit(grade: GradeRow) {
    setModalState({ mode: "edit", id: grade.id });
    setName(grade.name);
    setError(null);
  }

  function closeModal() {
    setModalState(null);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    if (modalState?.mode === "create") {
      const response = await fetch("/api/grades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.status === 201) {
        closeModal();
        await refresh(yearFilter);
        return;
      }
      setError((await response.json()).error);
      return;
    }
    if (modalState?.mode === "edit") {
      const response = await fetch(`/api/grades/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        closeModal();
        await refresh(yearFilter);
        return;
      }
      setError((await response.json()).error);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/grades/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleteBlockedId(null);
      await refresh(yearFilter);
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(id);
      return;
    }
    setError(body.error);
  }

  async function handleYearFilterChange(value: string) {
    setYearFilter(value);
    setPage(1);
    await refresh(value);
  }

  const filteredGrades = useMemo(
    () => grades.filter((grade) => grade.name.toLowerCase().includes(search.toLowerCase())),
    [grades, search]
  );
  const pageGrades = filteredGrades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const editingGrade = modalState?.mode === "edit" ? grades.find((grade) => grade.id === modalState.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Layers}
        title="Grades"
        subtitle="Manage and organize all grades in your school"
        action={
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Create Grade
          </button>
        }
      />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search grades..."
        filterValue={yearFilter}
        onFilterChange={handleYearFilterChange}
        filterOptions={[
          { value: "all", label: "All Years" },
          ...academicYears.map((year) => ({ value: String(year.id), label: year.name })),
        ]}
        view={view}
        onViewChange={setView}
      />

      {pageGrades.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No grades found</p>}

      {pageGrades.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageGrades.map((grade) => (
            <EntityCard
              key={grade.id}
              icon={Layers}
              href={`/dashboard/grades/${grade.id}`}
              title={grade.name}
              subtitle={`${grade.subjectCount} Subjects • ${grade.classCount} Classes`}
              tagLine={grade.subjectNames.length > 0 ? grade.subjectNames.join(", ") : "No subjects yet"}
              footerBadge={`Classes ${grade.classCount}`}
              onEdit={() => openEdit(grade)}
              menuItems={[{ label: "Delete", destructive: true, onClick: () => handleDelete(grade.id) }]}
              blockedMessage={
                deleteBlockedId === grade.id
                  ? `${grade.name} has subjects or classes and cannot be deleted.`
                  : undefined
              }
              blockedActions={
                deleteBlockedId === grade.id ? (
                  <button
                    type="button"
                    onClick={() => setDeleteBlockedId(null)}
                    className="rounded border border-amber-300 px-2 py-1 text-[11px]"
                  >
                    Cancel
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {pageGrades.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Name</th>
              <th className="border-b border-gray-200 pb-2">Subjects</th>
              <th className="border-b border-gray-200 pb-2">Classes</th>
              <th className="border-b border-gray-200 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageGrades.map((grade) => (
              <tr key={grade.id}>
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/grades/${grade.id}`} className="text-blue-600 underline">
                    {grade.name}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">{grade.subjectCount}</td>
                <td className="border-b border-gray-100 py-2">{grade.classCount}</td>
                <td className="border-b border-gray-100 py-2">
                  <button type="button" onClick={() => openEdit(grade)} className="mr-3 text-blue-600 underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(grade.id)} className="text-red-600 underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={filteredGrades.length} onPageChange={setPage} itemLabel="grades" />

      {modalState && (
        <Modal onClose={closeModal}>
          <h2 className="text-sm font-bold text-neutral-800">
            {modalState.mode === "create" ? "Create Grade" : editingGrade?.name}
          </h2>
          <input
            type="text"
            aria-label="Grade name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Grade 1"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
```

Then replace the entire contents of `apps/web/src/app/dashboard/grades/page.tsx` with:

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- grades-view.test.tsx` (from `apps/web/`)
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/GradesView.tsx apps/web/src/app/dashboard/grades/page.tsx apps/web/tests/grades-view.test.tsx
git commit -m "feat: redesign Grades page as a card grid"
```

---

### Task 10: Rewrite `ClassesView` and `classes/page.tsx`

**Files:**
- Modify: `apps/web/src/components/school-setup/ClassesView.tsx` (full rewrite)
- Modify: `apps/web/src/app/dashboard/classes/page.tsx`
- Create: `apps/web/tests/classes-view.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` (Task 6), `GridToolbar` (Task 7), `EntityCard` + `KebabMenuItem` (Tasks 8/5), `Pagination` (Task 4), `Modal` (existing), `ClassSummary`/`listClasses` (existing, unchanged), `listAcademicYears` (existing)
- Produces: `ClassesView({ initialClasses: ClassRow[]; grades: { id: number; name: string }[]; academicYears: { id: number; name: string }[] })` — this is the last task touching Classes; nothing downstream depends on it.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/classes-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClassesView } from "../src/components/school-setup/ClassesView";

const grades = [{ id: 1, name: "Grade 1" }];
const academicYears = [{ id: 1, name: "2026-27" }];

const classes = [
  { id: 1, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 1, archived: false },
  { id: 2, gradeId: 1, gradeName: "Grade 1", section: "B", academicYearId: 1, archived: true },
];

describe("ClassesView", () => {
  afterEach(() => cleanup());

  it("renders a card per class with the grade/section title and year subtitle", () => {
    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.getAllByText("2026-27")).toHaveLength(2);
  });

  it("shows an Archived badge only on archived classes", () => {
    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    expect(screen.getAllByText("Archived")).toHaveLength(1);
  });

  it("filters cards by the search box", async () => {
    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Search classes..."), "Section A");
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 1 · Section B" })).not.toBeInTheDocument();
  });

  it("offers Archive instead when a delete is blocked", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "This class has enrollment or scheduling history and cannot be deleted", deletable: false }),
        { status: 400 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    const card = screen.getByRole("link", { name: "Grade 1 · Section A" }).closest("div")!.parentElement!;
    await userEvent.click(within(card).getByRole("button", { name: "Actions for Grade 1 · Section A" }));
    await userEvent.click(within(card).getByText("Delete"));

    expect(await within(card).findByRole("button", { name: "Archive instead" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("switches to list view and shows the same classes in a table", async () => {
    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "Grade 1" })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- classes-view.test.tsx` (from `apps/web/`)
Expected: FAIL — `ClassesView` has no card/modal/list-view markup yet.

- [ ] **Step 3: Implement**

Replace the entire contents of `apps/web/src/components/school-setup/ClassesView.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { Modal } from "./Modal";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";
import type { KebabMenuItem } from "./KebabMenu";

export interface ClassRow {
  id: number;
  gradeId: number;
  gradeName: string;
  section: string;
  academicYearId: number;
  archived: boolean;
}

interface GradeOption {
  id: number;
  name: string;
}

interface AcademicYearOption {
  id: number;
  name: string;
}

type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;

const PAGE_SIZE = 8;

export function ClassesView({
  initialClasses,
  grades,
  academicYears,
}: {
  initialClasses: ClassRow[];
  grades: GradeOption[];
  academicYears: AcademicYearOption[];
}) {
  const [classes, setClasses] = useState(initialClasses);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [gradeId, setGradeId] = useState(grades[0] ? String(grades[0].id) : "");
  const [section, setSection] = useState("");
  const [academicYearId, setAcademicYearId] = useState(academicYears[0] ? String(academicYears[0].id) : "");
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh(academicYearIdFilter: string) {
    const params = new URLSearchParams({ includeArchived: "true" });
    if (academicYearIdFilter !== "all") params.set("academicYearId", academicYearIdFilter);
    const response = await fetch(`/api/classes?${params.toString()}`);
    setClasses(await response.json());
  }

  function openCreate() {
    setModalState({ mode: "create" });
    setGradeId(grades[0] ? String(grades[0].id) : "");
    setSection("");
    setAcademicYearId(academicYears[0] ? String(academicYears[0].id) : "");
    setError(null);
  }

  function openEdit(klass: ClassRow) {
    setModalState({ mode: "edit", id: klass.id });
    setSection(klass.section);
    setError(null);
  }

  function closeModal() {
    setModalState(null);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    if (modalState?.mode === "create") {
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gradeId: Number(gradeId), section, academicYearId: Number(academicYearId) }),
      });
      if (response.status === 201) {
        closeModal();
        await refresh(yearFilter);
        return;
      }
      setError((await response.json()).error);
      return;
    }
    if (modalState?.mode === "edit") {
      const response = await fetch(`/api/classes/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (response.ok) {
        closeModal();
        await refresh(yearFilter);
        return;
      }
      setError((await response.json()).error);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleteBlockedId(null);
      await refresh(yearFilter);
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
    await refresh(yearFilter);
  }

  async function handleUnarchive(id: number) {
    setError(null);
    const response = await fetch(`/api/classes/${id}/unarchive`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh(yearFilter);
  }

  async function handleYearFilterChange(value: string) {
    setYearFilter(value);
    setPage(1);
    await refresh(value);
  }

  const filteredClasses = useMemo(
    () =>
      classes.filter((klass) =>
        `${klass.gradeName} Section ${klass.section}`.toLowerCase().includes(search.toLowerCase())
      ),
    [classes, search]
  );
  const pageClasses = filteredClasses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Building2}
        title="Classes"
        subtitle="Manage and organize all classes in your school"
        action={
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Create Class
          </button>
        }
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
          {pageClasses.map((klass) => {
            const yearName = academicYears.find((year) => year.id === klass.academicYearId)?.name ?? String(klass.academicYearId);
            const menuItems: KebabMenuItem[] = [
              { label: "Delete", destructive: true, onClick: () => handleDelete(klass.id) },
              klass.archived
                ? { label: "Unarchive", onClick: () => handleUnarchive(klass.id) }
                : { label: "Archive", onClick: () => handleArchive(klass.id) },
            ];
            const title = `${klass.gradeName} · Section ${klass.section}`;
            return (
              <EntityCard
                key={klass.id}
                icon={Building2}
                href={`/dashboard/classes/${klass.id}`}
                title={title}
                subtitle={yearName}
                footerBadge={klass.archived ? "Archived" : undefined}
                onEdit={() => openEdit(klass)}
                menuItems={menuItems}
                blockedMessage={
                  deleteBlockedId === klass.id
                    ? `${klass.gradeName} ${klass.section} has history and cannot be permanently deleted.`
                    : undefined
                }
                blockedActions={
                  deleteBlockedId === klass.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleArchive(klass.id)}
                        className="rounded bg-amber-600 px-2 py-1 text-[11px] text-white"
                      >
                        Archive instead
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteBlockedId(null)}
                        className="rounded border border-amber-300 px-2 py-1 text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {pageClasses.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Grade</th>
              <th className="border-b border-gray-200 pb-2">Section</th>
              <th className="border-b border-gray-200 pb-2">Year</th>
              <th className="border-b border-gray-200 pb-2">Status</th>
              <th className="border-b border-gray-200 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageClasses.map((klass) => (
              <tr key={klass.id}>
                <td className="border-b border-gray-100 py-2">{klass.gradeName}</td>
                <td className="border-b border-gray-100 py-2">{klass.section}</td>
                <td className="border-b border-gray-100 py-2">
                  {academicYears.find((year) => year.id === klass.academicYearId)?.name ?? klass.academicYearId}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {klass.archived && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Archived</span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  <button type="button" onClick={() => openEdit(klass)} className="mr-3 text-blue-600 underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(klass.id)} className="text-red-600 underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={filteredClasses.length} onPageChange={setPage} itemLabel="classes" />

      {modalState && (
        <Modal onClose={closeModal}>
          <h2 className="text-sm font-bold text-neutral-800">
            {modalState.mode === "create" ? "Create Class" : "Edit Class"}
          </h2>
          {modalState.mode === "create" && (
            <select
              aria-label="Grade"
              value={gradeId}
              onChange={(event) => setGradeId(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            aria-label="Section"
            value={section}
            onChange={(event) => setSection(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. B"
          />
          {modalState.mode === "create" && (
            <select
              aria-label="Academic year"
              value={academicYearId}
              onChange={(event) => setAcademicYearId(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
```

Then, in `apps/web/src/app/dashboard/classes/page.tsx`, remove the now-redundant `<h1>Classes</h1>` (PageHeader renders the title inside `ClassesView`). Replace:

```tsx
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Classes</h1>
      <ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />
    </div>
  );
```

with:

```tsx
  return (
    <div className="p-6">
      <ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />
    </div>
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- classes-view.test.tsx` (from `apps/web/`)
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/ClassesView.tsx apps/web/src/app/dashboard/classes/page.tsx apps/web/tests/classes-view.test.tsx
git commit -m "feat: redesign Classes page as a card grid"
```

---

### Task 11: Full test suite + manual verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1–10
- Produces: nothing — this is the final task

- [ ] **Step 1: Run the full test suite**

Run: `npm test` (from `apps/web/`)
Expected: all tests PASS, including every test touched or added in Tasks 1–10 and all pre-existing tests untouched by this plan (e.g. `classes-lib.test.ts`, `classes-api.test.ts`, `nav-items.test.ts`).

- [ ] **Step 2: Manual verification in the browser**

Start the dev server (`npm run dev` from `apps/web/`, with `EXPOSE_OTP_FOR_TESTING` set if login is needed) and, logged in as an admin:

1. Go to `/dashboard/grades`. Confirm: sidebar "Grades" item is highlighted; page shows the icon/title/subtitle header, search box, "All Years" filter, Grid/List toggle, a card per grade with subject names and a `Classes N` badge, and pagination text at the bottom.
2. Type into the search box and confirm the grid filters live.
3. Click "+ Create Grade", fill in a name, save, and confirm the new card appears.
4. Click a card's "..." menu, click Delete on a grade with subjects/classes, and confirm the amber "cannot be deleted" banner replaces that card's footer with a working Cancel button.
5. Click "Edit" on a card, change the name, save, and confirm the card updates.
6. Click "List view" and confirm the same (filtered) grades render as a table; click "Grid view" to switch back.
7. Change the "All Years" filter to a specific year and confirm each card's class count updates accordingly.
8. Repeat steps 1–7 on `/dashboard/classes`, additionally verifying: the Archived badge only appears on archived classes, and deleting a class with enrollment history offers "Archive instead" (and that it works).
9. Resize the browser to a narrow width and confirm the grid reflows to fewer columns without horizontal scrolling.

- [ ] **Step 3: Fix any issues found during manual verification**

If any step in Step 2 doesn't match, fix the relevant file from Tasks 1–10, re-run that task's test file, then re-run `npm test` in full before proceeding.

- [ ] **Step 4: Final commit (only if Step 3 required changes)**

```bash
git add -A
git commit -m "fix: address issues found in manual verification of Grades/Classes redesign"
```

(Skip this step entirely if Step 2 required no code changes.)

---

## Self-Review Notes

- **Spec coverage:** every spec section has a task — shared components (Tasks 4–8), Grades page incl. backend academicYearId/subjectNames (Tasks 2, 3, 9), Classes page (Task 10), sidebar active-state (Task 1), pagination (Tasks 4, 9, 10), error/empty states (Tasks 8, 9, 10), testing (Task 11).
- **Placeholder scan:** all steps contain complete, runnable code; no "TBD"/"add error handling" placeholders.
- **Type consistency:** `GradeSummary`/`GradeRow` both carry `{ id, name, subjectCount, classCount, subjectNames }` across Tasks 2, 3, and 9. `KebabMenuItem` (Task 5) is used identically in `EntityCard` (Task 8), `GradesView` (Task 9), and `ClassesView` (Task 10). `EntityCard`'s `tagLine`/`footerBadge` are optional and used accordingly (Grades always passes both; Classes omits `tagLine` and passes `footerBadge` only when archived).
