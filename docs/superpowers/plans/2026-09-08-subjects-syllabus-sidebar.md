# Subjects & Syllabus Sidebar Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Subjects/Syllabus their own sidebar entry and route tree (list Grades → click one → see its Subjects → click a subject → see its Syllabus versions), fully separate from the Grades module which currently owns this flow.

**Architecture:** Move the existing `GradeDetailView`/`SyllabusHistoryView` client components (unchanged business logic, same API calls) onto a new `/dashboard/subjects/...` route tree fronted by a new grade-picker page/component (`SubjectsView`). Remove the old `/dashboard/grades/[id]/...` routes and the two placeholder nav groups they no longer need. No API or Prisma changes.

**Tech Stack:** Next.js App Router (React Server Components + client components), Prisma, Vitest + Testing Library.

## Global Constraints

- No changes to any `/api/*` route or `lib/school-setup/subjects.ts` / `lib/school-setup/grades.ts` functions — this is a pages/nav/components move only.
- Admin-only: every new/moved page uses `requireDashboardRole(["admin"])`, matching the pages being replaced.
- Follow existing component conventions in `apps/web/src/components/school-setup/`: `PageHeader`, `GridToolbar`, `EntityCard`, `Pagination` for any new listing UI.
- Run tests with `cd apps/web && npm test` (Vitest). All existing tests must stay green; new/changed behavior needs new/updated tests.

---

### Task 1: `EntityCard` — optional `href`, hide kebab menu when `menuItems` is empty

**Files:**
- Modify: `apps/web/src/components/school-setup/EntityCard.tsx`
- Test: `apps/web/tests/entity-card.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EntityCard` props change from `href: string` to `href?: string`. When `href` is omitted, the title renders as a `<span className="text-sm font-bold text-neutral-900">{title}</span>` instead of a `<Link>`. When `menuItems` is an empty array, the `KebabMenu` is not rendered at all (previously always rendered, even with zero items). `menuItems: KebabMenuItem[]` stays a required prop (pass `[]` explicitly, as existing call sites already do).

- [ ] **Step 1: Add the two new failing tests to `entity-card.test.tsx`**

Add these two `it` blocks inside the existing `describe("EntityCard", ...)` block (after the last existing test):

```tsx
  it("renders the title as plain text when href is absent", () => {
    render(
      <EntityCard
        icon={Layers}
        title="Grade 1"
        subtitle="6 Subjects • 2 Classes"
        menuItems={[]}
      />
    );
    expect(screen.queryByRole("link", { name: "Grade 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Grade 1")).toBeInTheDocument();
  });

  it("omits the kebab menu button when menuItems is empty", () => {
    render(
      <EntityCard
        icon={Layers}
        href="/dashboard/grades/1"
        title="Grade 1"
        subtitle="6 Subjects • 2 Classes"
        menuItems={[]}
      />
    );
    expect(screen.queryByRole("button", { name: "Actions for Grade 1" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/entity-card.test.tsx`
Expected: the two new tests FAIL — `href` is currently required (a TypeScript error would surface too, since the test omits it) and the kebab button currently always renders.

- [ ] **Step 3: Update `EntityCard.tsx`**

Replace the full file content with:

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
  href?: string;
  title: string;
  subtitle: string;
  tagLine?: string;
  footerBadge?: string;
  onEdit?: () => void;
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
        {menuItems.length > 0 && <KebabMenu label={`Actions for ${title}`} items={menuItems} />}
      </div>
      <div>
        {href ? (
          <Link href={href} className="text-sm font-bold text-neutral-900 hover:underline">
            {title}
          </Link>
        ) : (
          <span className="text-sm font-bold text-neutral-900">{title}</span>
        )}
        <p className="text-[11px] text-neutral-400">{subtitle}</p>
      </div>
      {tagLine && <p className="line-clamp-1 text-[11px] text-neutral-500">{tagLine}</p>}

      {blockedMessage ? (
        <div className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          <p>{blockedMessage}</p>
          <div className="mt-1.5 flex gap-2">{blockedActions}</div>
        </div>
      ) : (
        (footerBadge || onEdit) && (
          <div className="flex items-center justify-between">
            {footerBadge ? (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                {footerBadge}
              </span>
            ) : (
              <span />
            )}
            {onEdit && (
              <button type="button" onClick={onEdit} className="text-xs font-semibold text-indigo-600 hover:underline">
                Edit
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run all `entity-card.test.tsx` tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/entity-card.test.tsx`
Expected: all tests PASS (the 4 pre-existing tests still pass unchanged, since they all pass a non-empty `href` and non-empty `menuItems` for the delete-menu tests, or empty `menuItems` where kebab visibility isn't asserted).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/EntityCard.tsx apps/web/tests/entity-card.test.tsx
git commit -m "feat(entity-card): make href optional, hide kebab menu when empty"
```

---

### Task 2: `GradesView` — grade cards stop linking to the (soon-removed) grade-detail page

**Files:**
- Modify: `apps/web/src/components/school-setup/GradesView.tsx`
- Test: `apps/web/tests/grades-view.test.tsx`

**Interfaces:**
- Consumes: `EntityCard` with optional `href` (Task 1).
- Produces: no change to `GradesView`'s own exported props/types (`GradeRow` is unchanged — still exported for reuse in Task 5).

- [ ] **Step 1: Update `grades-view.test.tsx` to stop expecting grade names to be links**

Replace every `screen.getByRole("link", { name: "Grade 1" })` / `"Grade 9"` with `screen.getByText(...)`, and every `screen.queryByRole("link", { name: "Grade 2" })` with `screen.queryByText(...)`. The full updated file:

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
    expect(screen.getByText("Grade 1")).toBeInTheDocument();
    expect(screen.getByText("English, Math")).toBeInTheDocument();
    expect(screen.getByText("No subjects yet")).toBeInTheDocument();
    expect(screen.getByText("Classes 2")).toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Search grades..."), "Grade 1");
    expect(screen.getByText("Grade 1")).toBeInTheDocument();
    expect(screen.queryByText("Grade 2")).not.toBeInTheDocument();
  });

  it("links Create Grade to the dedicated Add Grade page", () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "+ Create Grade" })).toHaveAttribute("href", "/dashboard/grades/add");
  });

  it("shows the delete-blocked banner in place of the footer on a 400 deletable:false response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "This grade has subjects or classes and cannot be deleted", deletable: false }), {
        status: 400,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    const grade1Card = screen.getByText("Grade 1").closest("div")!.parentElement!;
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

  it("surfaces a non-blocked delete failure as a visible top-level error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Something went wrong deleting the grade" }), { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    const grade1Card = screen.getByText("Grade 1").closest("div")!.parentElement!;
    await userEvent.click(within(grade1Card).getByRole("button", { name: "Actions for Grade 1" }));
    await userEvent.click(within(grade1Card).getByText("Delete"));

    expect(await screen.findByText("Something went wrong deleting the grade")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("clamps to a valid page after deleting the last item on the final page", async () => {
    const manyGrades = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      name: `Grade ${index + 1}`,
      subjectCount: 0,
      classCount: 0,
      subjectNames: [],
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(manyGrades.slice(0, 8)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={manyGrades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Grade 9")).toBeInTheDocument();

    const grade9Card = screen.getByText("Grade 9").closest("div")!.parentElement!;
    await userEvent.click(within(grade9Card).getByRole("button", { name: "Actions for Grade 9" }));
    await userEvent.click(within(grade9Card).getByText("Delete"));

    expect(await screen.findByText("Grade 1")).toBeInTheDocument();
    expect(screen.queryByText("No grades found")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/grades-view.test.tsx`
Expected: FAIL — `GradesView` still renders grade names as links, but that's not what's being asserted as wrong yet; rather, the `getByRole("link", ...)` assertions from the OLD test are gone so this step really just confirms the *new* file runs against the *old* component. Since `getByText("Grade 1")` also matches the current (still-linked) implementation, these particular assertions will actually PASS already — that's fine, this task is a safe no-op test change until Step 3. What must fail first is verified in Step 2 differently: temporarily confirm by inspection that `GradesView.tsx` still passes `href` (grep for `dashboard/grades/${grade.id}` in the file) before editing it. Skip a hard "must fail" gate here since text queries subsume link queries; proceed to Step 3 and let Step 4 be the real green check.

- [ ] **Step 3: Update `GradesView.tsx`**

In the grid-view `EntityCard` call (around line 156), delete the `href` line:

```tsx
            <EntityCard
              key={grade.id}
              icon={Layers}
              href={`/dashboard/grades/${grade.id}`}
              title={grade.name}
```

becomes:

```tsx
            <EntityCard
              key={grade.id}
              icon={Layers}
              title={grade.name}
```

In the list-view table row (around line 200), replace the `Link`-wrapped name with plain text:

```tsx
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/grades/${grade.id}`} className="text-blue-600 underline">
                    {grade.name}
                  </Link>
                </td>
```

becomes:

```tsx
                <td className="border-b border-gray-100 py-2">{grade.name}</td>
```

The `import Link from "next/link";` at the top of the file is still used by the "+ Create Grade" link, so leave it in place.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/grades-view.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/GradesView.tsx apps/web/tests/grades-view.test.tsx
git commit -m "feat(grades): stop linking grade cards to the removed grade-detail page"
```

---

### Task 3: Nav — replace the "Subjects"/"Syllabus" placeholder groups with one "Subjects" leaf, remove their stub pages

**Files:**
- Modify: `apps/web/src/lib/dashboard/nav-items.ts`
- Delete: `apps/web/src/app/dashboard/subjects/add/page.tsx`
- Delete: `apps/web/src/app/dashboard/syllabus/page.tsx`
- Delete: `apps/web/src/app/dashboard/syllabus/add/page.tsx`
- Test: `apps/web/tests/nav-items.test.ts` (no edits needed — it self-validates; run it to confirm)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getNavSectionsForRole("admin")` now includes, in the Academic section, a top-level leaf `{ href: "/dashboard/subjects", label: "Subjects", icon: "BookMarked" }` in place of the two removed groups. `/dashboard/subjects/page.tsx` (still the placeholder stub at this point — replaced in Task 6) is the only surviving page under the old `subjects`/`syllabus` prefixes.

- [ ] **Step 1: Run `nav-items.test.ts` to confirm the current baseline passes**

Run: `cd apps/web && npx vitest run tests/nav-items.test.ts`
Expected: PASS (this establishes the starting point; the test is self-validating against the filesystem, so there's no separate "write a failing test" step here — editing `nav-items.ts` is what will make it exercise the new href).

- [ ] **Step 2: Edit `nav-items.ts`**

In `NAV_TREE`, inside the `"Academic"` section's `items` array, replace this block:

```ts
      {
        label: "Subjects",
        icon: "BookMarked",
        children: [
          { href: "/dashboard/subjects", label: "All Subjects", roles: ["admin"] },
          { href: "/dashboard/subjects/add", label: "Add Subject", roles: ["admin"] },
        ],
      },
      {
        label: "Syllabus",
        icon: "ScrollText",
        children: [
          { href: "/dashboard/syllabus", label: "All Syllabus", roles: ["admin"] },
          { href: "/dashboard/syllabus/add", label: "Add Syllabus", roles: ["admin"] },
        ],
      },
```

with:

```ts
      { href: "/dashboard/subjects", label: "Subjects", icon: "BookMarked", roles: ["admin"] },
```

- [ ] **Step 3: Delete the now-orphaned stub pages**

```bash
rm apps/web/src/app/dashboard/subjects/add/page.tsx
rmdir apps/web/src/app/dashboard/subjects/add
rm -rf apps/web/src/app/dashboard/syllabus
```

- [ ] **Step 4: Run the nav test suite to verify it still passes**

Run: `cd apps/web && npx vitest run tests/nav-items.test.ts tests/sidebar.test.tsx`
Expected: all tests PASS — the existence check no longer looks for `/dashboard/subjects/add` or `/dashboard/syllabus*` (their nav entries are gone), and `/dashboard/subjects/page.tsx` still exists (it's edited in Task 6, not removed).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard/nav-items.ts
git add -A apps/web/src/app/dashboard/subjects/add apps/web/src/app/dashboard/syllabus
git commit -m "feat(nav): merge Subjects/Syllabus placeholders into one Subjects entry"
```

---

### Task 4: `GradeDetailView` — point its back-link and subject-card links at the new `/dashboard/subjects/...` paths

**Files:**
- Modify: `apps/web/src/components/school-setup/GradeDetailView.tsx`
- Test: `apps/web/tests/grade-detail-view.test.tsx`

**Interfaces:**
- Consumes: nothing new (same `{ gradeId, gradeName, initialSubjects }` props as before).
- Produces: back-link now `href="/dashboard/subjects"` with visible text "Subjects"; each subject card/list-row link now points to `` `/dashboard/subjects/${gradeId}/${subject.id}` `` instead of `` `/dashboard/grades/${gradeId}/subjects/${subject.id}` ``.

- [ ] **Step 1: Update the back-link assertion in `grade-detail-view.test.tsx`**

Change:

```tsx
    expect(screen.getByRole("link", { name: /grades/i })).toHaveAttribute("href", "/dashboard/grades");
```

to:

```tsx
    expect(screen.getByRole("link", { name: /subjects/i })).toHaveAttribute("href", "/dashboard/subjects");
```

(This is the only line in the file referencing the old path — the subject-card links are asserted only by visible name, e.g. `getByRole("link", { name: "Mathematics" })`, with no `href` check, so nothing else needs to change.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/grade-detail-view.test.tsx`
Expected: FAIL on the back-link test — the component still renders "Grades" / `/dashboard/grades`.

- [ ] **Step 3: Update `GradeDetailView.tsx`**

Change the back link (near the top of the returned JSX):

```tsx
      <Link
        href="/dashboard/grades"
        className="flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Grades
      </Link>
```

to:

```tsx
      <Link
        href="/dashboard/subjects"
        className="flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Subjects
      </Link>
```

Change the grid-view subject card `href` (inside the `EntityCard` in the grid-view map):

```tsx
              href={`/dashboard/grades/${gradeId}/subjects/${subject.id}`}
```

to:

```tsx
              href={`/dashboard/subjects/${gradeId}/${subject.id}`}
```

Change the list-view row `Link` `href`:

```tsx
                    href={`/dashboard/grades/${gradeId}/subjects/${subject.id}`}
```

to:

```tsx
                    href={`/dashboard/subjects/${gradeId}/${subject.id}`}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/grade-detail-view.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/GradeDetailView.tsx apps/web/tests/grade-detail-view.test.tsx
git commit -m "feat(grade-detail): point subject links at the new /dashboard/subjects routes"
```

---

### Task 5: New `SubjectsView` component — the Grades picker that fronts the Subjects flow

**Files:**
- Create: `apps/web/src/components/school-setup/SubjectsView.tsx`
- Test: `apps/web/tests/subjects-view.test.tsx`

**Interfaces:**
- Consumes: `GradeRow` type exported from `apps/web/src/components/school-setup/GradesView.tsx` (`{ id: number; name: number... }` — actually `{ id: number; name: string; subjectCount: number; classCount: number; subjectNames: string[] }`, unchanged); `PageHeader`, `GridToolbar`, `EntityCard` (with the Task 1 optional-`href`/empty-`menuItems` behavior), `Pagination` — all from the same directory.
- Produces: `export function SubjectsView({ initialGrades }: { initialGrades: GradeRow[] })`. Renders one card per grade, each linking to `` `/dashboard/subjects/${grade.id}` ``, with no create/edit/delete affordances.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/tests/subjects-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubjectsView } from "../src/components/school-setup/SubjectsView";

const grades = [
  { id: 1, name: "Grade 1", subjectCount: 2, classCount: 2, subjectNames: ["English", "Math"] },
  { id: 2, name: "Grade 2", subjectCount: 0, classCount: 0, subjectNames: [] },
];

describe("SubjectsView", () => {
  afterEach(() => cleanup());

  it("renders a card per grade linking to its subjects page, with a subject count", () => {
    render(<SubjectsView initialGrades={grades} />);
    expect(screen.getByRole("link", { name: "Grade 1" })).toHaveAttribute("href", "/dashboard/subjects/1");
    expect(screen.getByRole("link", { name: "Grade 2" })).toHaveAttribute("href", "/dashboard/subjects/2");
    expect(screen.getByText("2 Subjects")).toBeInTheDocument();
    expect(screen.getByText("0 Subjects")).toBeInTheDocument();
  });

  it("does not render an actions menu on grade cards", () => {
    render(<SubjectsView initialGrades={grades} />);
    expect(screen.queryByRole("button", { name: "Actions for Grade 1" })).not.toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<SubjectsView initialGrades={grades} />);
    await userEvent.type(screen.getByLabelText("Search grades..."), "Grade 1");
    expect(screen.getByRole("link", { name: "Grade 1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 2" })).not.toBeInTheDocument();
  });

  it("switches to list view and shows the same grades in a table", async () => {
    render(<SubjectsView initialGrades={grades} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Grade 1" })).toBeInTheDocument();
  });

  it("shows an empty state when no grades match the search", async () => {
    render(<SubjectsView initialGrades={grades} />);
    await userEvent.type(screen.getByLabelText("Search grades..."), "nonexistent");
    expect(screen.getByText("No grades found")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/subjects-view.test.tsx`
Expected: FAIL with a module-not-found error — `SubjectsView` doesn't exist yet.

- [ ] **Step 3: Create `SubjectsView.tsx`**

Create `apps/web/src/components/school-setup/SubjectsView.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";
import type { GradeRow } from "./GradesView";

const PAGE_SIZE = 8;

function subjectLabel(count: number): string {
  return `${count} Subject${count === 1 ? "" : "s"}`;
}

export function SubjectsView({ initialGrades }: { initialGrades: GradeRow[] }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const filteredGrades = useMemo(
    () => initialGrades.filter((grade) => grade.name.toLowerCase().includes(search.toLowerCase())),
    [initialGrades, search]
  );
  const totalPages = Math.max(1, Math.ceil(filteredGrades.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGrades = filteredGrades.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={BookMarked} title="Subjects" subtitle="Select a grade to view its subjects" />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search grades..."
        view={view}
        onViewChange={setView}
      />

      {pageGrades.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No grades found</p>}

      {pageGrades.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageGrades.map((grade) => (
            <EntityCard
              key={grade.id}
              icon={BookMarked}
              href={`/dashboard/subjects/${grade.id}`}
              title={grade.name}
              subtitle={subjectLabel(grade.subjectCount)}
              menuItems={[]}
            />
          ))}
        </div>
      )}

      {pageGrades.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Grade</th>
              <th className="border-b border-gray-200 pb-2">Subjects</th>
            </tr>
          </thead>
          <tbody>
            {pageGrades.map((grade) => (
              <tr key={grade.id}>
                <td className="border-b border-gray-100 py-2">
                  <Link href={`/dashboard/subjects/${grade.id}`} className="text-blue-600 underline">
                    {grade.name}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">{grade.subjectCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={filteredGrades.length}
        onPageChange={setPage}
        itemLabel="grades"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/subjects-view.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/SubjectsView.tsx apps/web/tests/subjects-view.test.tsx
git commit -m "feat(subjects): add SubjectsView grade-picker component"
```

---

### Task 6: Wire up the new `/dashboard/subjects/...` route tree, remove the old grade-nested routes

**Files:**
- Modify: `apps/web/src/app/dashboard/subjects/page.tsx` (replace the "Coming Soon" stub)
- Create: `apps/web/src/app/dashboard/subjects/[gradeId]/page.tsx`
- Create: `apps/web/src/app/dashboard/subjects/[gradeId]/[subjectId]/page.tsx`
- Delete: `apps/web/src/app/dashboard/grades/[id]/page.tsx`
- Delete: `apps/web/src/app/dashboard/grades/[id]/subjects/[subjectId]/page.tsx`
- Test: `apps/web/tests/nav-items.test.ts` (run only — no edits needed)

**Interfaces:**
- Consumes: `SubjectsView` (Task 5), `GradeDetailView` and `SyllabusHistoryView` (unchanged components, already updated for the new link targets in Task 4), `listGrades` from `@/lib/school-setup/grades`, `listSubjects`/`listSyllabusVersions` from `@/lib/school-setup/subjects`, `requireDashboardRole` from `@/lib/auth/require-dashboard-role`, `prisma` from `@/lib/prisma`.
- Produces: three routable pages completing the flow described in the goal. No new exports consumed by later tasks (this is the last task).

- [ ] **Step 1: Replace `apps/web/src/app/dashboard/subjects/page.tsx`**

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listGrades } from "@/lib/school-setup/grades";
import { prisma } from "@/lib/prisma";
import { SubjectsView } from "@/components/school-setup/SubjectsView";

export default async function SubjectsPage() {
  const claims = await requireDashboardRole(["admin"]);
  const grades = await listGrades(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <SubjectsView initialGrades={grades} />
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/app/dashboard/subjects/[gradeId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listSubjects } from "@/lib/school-setup/subjects";
import { prisma } from "@/lib/prisma";
import { GradeDetailView } from "@/components/school-setup/GradeDetailView";

export default async function GradeSubjectsPage(props: { params: Promise<{ gradeId: string }> }) {
  const params = await props.params;
  const claims = await requireDashboardRole(["admin"]);
  const gradeId = Number(params.gradeId);
  if (Number.isNaN(gradeId)) notFound();

  const grade = await prisma.grade.findFirst({ where: { id: gradeId, schoolId: claims.schoolId } });
  if (!grade) notFound();

  const result = await listSubjects(prisma, { gradeId, schoolId: claims.schoolId });
  const subjects = result.ok ? result.subjects : [];

  return (
    <div className="p-6">
      <GradeDetailView gradeId={gradeId} gradeName={grade.name} initialSubjects={subjects} />
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/app/dashboard/subjects/[gradeId]/[subjectId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listSyllabusVersions } from "@/lib/school-setup/subjects";
import { prisma } from "@/lib/prisma";
import { SyllabusHistoryView } from "@/components/school-setup/SyllabusHistoryView";

export default async function SubjectDetailPage(props: { params: Promise<{ gradeId: string; subjectId: string }> }) {
  const params = await props.params;
  const claims = await requireDashboardRole(["admin"]);
  const gradeId = Number(params.gradeId);
  const subjectId = Number(params.subjectId);
  if (Number.isNaN(gradeId) || Number.isNaN(subjectId)) notFound();

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, gradeId, grade: { schoolId: claims.schoolId } },
    include: { grade: true },
  });
  if (!subject) notFound();

  const result = await listSyllabusVersions(prisma, { subjectId, schoolId: claims.schoolId });
  const versions = result.ok ? result.versions : [];

  return (
    <div className="p-6">
      <Link
        href={`/dashboard/subjects/${gradeId}`}
        className="flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {subject.grade.name}
      </Link>
      <h1 className="text-xl font-semibold text-gray-800">{subject.name}</h1>
      <SyllabusHistoryView subjectId={subjectId} subjectName={subject.name} initialVersions={versions} />
    </div>
  );
}
```

- [ ] **Step 4: Delete the old grade-nested routes**

```bash
rm -rf apps/web/src/app/dashboard/grades/[id]
```

- [ ] **Step 5: Run the full test suite**

Run: `cd apps/web && npm test`
Expected: all tests PASS, including `nav-items.test.ts` (its filesystem existence check now resolves `/dashboard/subjects` to the real page created in Step 1) and every test touched in Tasks 1–5.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/subjects apps/web/src/app/dashboard/grades
git commit -m "feat(subjects): wire up the /dashboard/subjects/[gradeId]/[subjectId] route tree, remove the old grade-nested routes"
```

---

### Task 7: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and open the dashboard**

Use the project's dev server (`npm run dev` inside `apps/web`, or the harness's preview tooling) logged in as an admin, and navigate to `/dashboard`.

- [ ] **Step 2: Confirm the sidebar**

In the Academic section, confirm there is a single "Subjects" entry (not two), and that "Grades" and "Classes" are unchanged.

- [ ] **Step 3: Walk the full flow**

Click "Subjects" → confirm a grid of grade cards appears, each showing a subject count. Click a grade → confirm its subject list appears (same UI as before, now with a "← Subjects" back link). Click a subject → confirm the syllabus-version history appears, with a back link to the grade's subject list. Use the back links to navigate back up to `/dashboard/subjects`.

- [ ] **Step 4: Confirm the Grades module no longer links into Subjects**

Go to "Grades" in the sidebar → confirm grade cards no longer navigate anywhere when clicked (name is plain text now), but Edit (kebab menu) and Delete still work.

- [ ] **Step 5: Confirm old URLs are gone**

Navigate directly to a previously-valid `/dashboard/grades/1` URL (substitute a real grade id) and confirm it 404s (the route no longer exists).

No commit for this task — it's verification only. If any step surfaces a bug, fix it in the relevant task's files and re-run that task's tests before re-verifying here.
