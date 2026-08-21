# Grade Detail Page Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the grade detail page (`/dashboard/grades/[id]`) from a plain HTML table + inline form into the card-grid layout established by the Grades/Classes redesign, reusing the existing shared components.

**Architecture:** `GradeDetailView.tsx` is rewritten to follow the same shape as `GradesView.tsx` — `PageHeader` + `GridToolbar` (search + Grid/List only) + a responsive grid of `EntityCard`s (or, in list view, the existing table) + `Pagination`, with add-subject moved into a `Modal`. Two shared components get small, additive, backward-compatible changes: `GridToolbar`'s filter props become optional, and `EntityCard`'s `onEdit` becomes optional. One backend field is added: `SubjectSummary.versionCount`.

**Tech Stack:** Next.js App Router, React (client components), TypeScript, Tailwind CSS, Prisma, Vitest + Testing Library.

## Global Constraints

- No new dependencies; reuse the existing shared components in `apps/web/src/components/school-setup/` (`PageHeader`, `GridToolbar`, `EntityCard`, `KebabMenu`, `Pagination`, `Modal`).
- Follow the existing neutral-gray design language: cards `rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]`, icon badges `rounded-xl bg-indigo-50 text-indigo-600`, micro-labels `text-[10px]`/`text-[11px]`. No new fonts or colors.
- Grid breakpoints: `grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`. Page size 8.
- Delete stays one-click (no confirm modal) — matches the app's established pattern (see [2026-08-19-grades-classes-card-redesign-design.md](../specs/2026-08-19-grades-classes-card-redesign-design.md)).
- No rename/edit capability for subjects — none exists today; do not add one.

---

### Task 1: Add `versionCount` to `SubjectSummary`

**Files:**
- Modify: `apps/web/src/lib/school-setup/subjects.ts:1-47`
- Test: `apps/web/tests/subjects-lib.test.ts`

**Interfaces:**
- Produces: `SubjectSummary` gains `versionCount: number`. `listSubjects` and `createSubject` both return this field populated (`createSubject` always returns `0`, since a newly created subject has no syllabus versions yet). The `Subject` Prisma model's relation to `SyllabusVersion` is named `versions` (see `apps/web/prisma/schema.prisma:108`).

- [ ] **Step 1: Write the failing test**

Add this test to `apps/web/tests/subjects-lib.test.ts` (inside the existing `describe("subjects lib", ...)` block, after the "adds sequential syllabus versions..." test):

```ts
  it("reports versionCount on listed subjects", async () => {
    const created = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    if (!created.ok) throw new Error("setup failed");
    expect(created.subject.versionCount).toBe(0);

    await createSyllabusVersion(prisma, {
      subjectId: created.subject.id,
      schoolId,
      title: "v1",
      content: "Numbers",
      createdById: adminId,
    });

    const result = await listSubjects(prisma, { gradeId, schoolId });
    if (!result.ok) throw new Error("expected ok");
    expect(result.subjects[0].versionCount).toBe(1);
  });
```

Also update the existing "creates a subject and lists it scoped to its grade" test's assertion (it currently omits `versionCount`, which will now fail strict equality):

```ts
  it("creates a subject and lists it scoped to its grade", async () => {
    const created = await createSubject(prisma, { gradeId, schoolId, name: "Mathematics" });
    expect(created.ok).toBe(true);

    const result = await listSubjects(prisma, { gradeId, schoolId });
    expect(result).toEqual({
      ok: true,
      subjects: [{ id: expect.any(Number), name: "Mathematics", gradeId, versionCount: 0 }],
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/subjects-lib.test.ts`
Expected: FAIL — `versionCount` is `undefined` (property doesn't exist yet) on both the updated equality test and the new test.

- [ ] **Step 3: Implement `versionCount`**

In `apps/web/src/lib/school-setup/subjects.ts`, update the `SubjectSummary` interface and both `listSubjects` and `createSubject`:

```ts
export interface SubjectSummary {
  id: number;
  name: string;
  gradeId: number;
  versionCount: number;
}
```

```ts
export async function listSubjects(
  prisma: PrismaClient,
  params: { gradeId: number; schoolId: number }
): Promise<ListSubjectsResult> {
  const grade = await prisma.grade.findFirst({ where: { id: params.gradeId, schoolId: params.schoolId } });
  if (!grade) return { ok: false, error: "INVALID_GRADE" };

  const subjects = await prisma.subject.findMany({
    where: { gradeId: params.gradeId },
    orderBy: { name: "asc" },
    include: { _count: { select: { versions: true } } },
  });
  return {
    ok: true,
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, gradeId: s.gradeId, versionCount: s._count.versions })),
  };
}
```

```ts
  try {
    const created = await prisma.subject.create({
      data: { gradeId: params.gradeId, name: params.name },
    });
    return { ok: true, subject: { id: created.id, name: created.name, gradeId: created.gradeId, versionCount: 0 } };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
```

(This replaces the existing `return`/`catch` inside `createSubject` — everything else in the file is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/subjects-lib.test.ts`
Expected: PASS (all tests, including the two touched above)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/school-setup/subjects.ts apps/web/tests/subjects-lib.test.ts
git commit -m "feat: add versionCount to SubjectSummary"
```

---

### Task 2: Make `GridToolbar`'s filter optional

**Files:**
- Modify: `apps/web/src/components/school-setup/GridToolbar.tsx`
- Test: `apps/web/tests/grid-toolbar.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GridToolbar` props `filterValue`, `onFilterChange`, `filterOptions` become optional. When `filterOptions` is `undefined`, no `<select>` is rendered. `searchValue`, `onSearchChange`, `searchLabel`, `view`, `onViewChange` are unchanged and still required.

- [ ] **Step 1: Write the failing test**

Add this test to `apps/web/tests/grid-toolbar.test.tsx` (inside the existing `describe("GridToolbar", ...)` block):

```ts
  it("omits the filter select when filterOptions is not provided", () => {
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={vi.fn()}
        searchLabel="Search subjects..."
        view="grid"
        onViewChange={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Filter by academic year")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search subjects...")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/grid-toolbar.test.tsx`
Expected: FAIL — TypeScript error (missing required props `filterValue`/`onFilterChange`/`filterOptions`) or, if TS is not enforced at test time, the select still renders because the current implementation renders it unconditionally.

- [ ] **Step 3: Make the filter props optional**

Replace the props type and the `<select>` block in `apps/web/src/components/school-setup/GridToolbar.tsx`:

```tsx
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
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: { value: string; label: string }[];
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
}) {
```

```tsx
        {filterOptions && (
          <select
            aria-label="Filter by academic year"
            value={filterValue}
            onChange={(event) => onFilterChange?.(event.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
```

(This `{filterOptions && (...)}` block replaces the existing unconditional `<select>...</select>` block; everything else in the file — the search input and the Grid/List toggle — is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/grid-toolbar.test.tsx`
Expected: PASS (all tests, including the pre-existing ones that still pass `filterOptions`)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/GridToolbar.tsx apps/web/tests/grid-toolbar.test.tsx
git commit -m "feat: make GridToolbar filter props optional"
```

---

### Task 3: Make `EntityCard`'s `onEdit` optional

**Files:**
- Modify: `apps/web/src/components/school-setup/EntityCard.tsx`
- Test: `apps/web/tests/entity-card.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EntityCard` prop `onEdit?: () => void`. When omitted and there's no `footerBadge` either, the footer row is not rendered at all. When omitted but `footerBadge` is present, the footer row renders with the badge but no Edit button.

- [ ] **Step 1: Write the failing test**

Add this test to `apps/web/tests/entity-card.test.tsx` (inside the existing `describe("EntityCard", ...)` block):

```ts
  it("omits the Edit button and footer row when onEdit and footerBadge are both absent", () => {
    render(
      <EntityCard
        icon={Layers}
        href="/dashboard/grades/1/subjects/1"
        title="Mathematics"
        subtitle="2 syllabus versions"
        menuItems={[]}
      />
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/entity-card.test.tsx`
Expected: FAIL — TypeScript error (`onEdit` is missing, currently required) or a rendered "Edit" button with an `undefined` click handler.

- [ ] **Step 3: Make `onEdit` optional and conditionally render the footer**

Replace the props type and the footer block in `apps/web/src/components/school-setup/EntityCard.tsx`:

```tsx
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
  onEdit?: () => void;
  menuItems: KebabMenuItem[];
  blockedMessage?: string;
  blockedActions?: React.ReactNode;
}) {
```

```tsx
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
```

(This replaces the existing `{blockedMessage ? (...) : (...)}` block; the top row with the icon badge and `KebabMenu`, and the title/subtitle/tagLine block above it, are unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/entity-card.test.tsx`
Expected: PASS (all tests, including the pre-existing ones that still pass `onEdit`)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/EntityCard.tsx apps/web/tests/entity-card.test.tsx
git commit -m "feat: make EntityCard onEdit optional"
```

---

### Task 4: Rewrite `GradeDetailView.tsx` as a card grid

**Files:**
- Modify: `apps/web/src/components/school-setup/GradeDetailView.tsx` (full rewrite)
- Modify: `apps/web/src/app/dashboard/grades/[id]/page.tsx:19-24`
- Test: Create `apps/web/tests/grade-detail-view.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` (`icon`, `title`, `subtitle`, `action`), `GridToolbar` (`searchValue`, `onSearchChange`, `searchLabel`, `view`, `onViewChange` — no filter props, per Task 2), `EntityCard` (`icon`, `href`, `title`, `subtitle`, `menuItems`, `blockedMessage`, `blockedActions` — no `onEdit`, `footerBadge`, or `tagLine`, per Task 3), `Pagination` (`page`, `pageSize`, `total`, `onPageChange`, `itemLabel`), `Modal` (`children`, `onClose`). `SubjectSummary` now includes `versionCount` (Task 1).
- Produces: `GradeDetailView` keeps its existing exported prop shape (`gradeId: number`, `gradeName: string`, `initialSubjects: SubjectRow[]`), with `SubjectRow` gaining `versionCount: number`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/grade-detail-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradeDetailView } from "../src/components/school-setup/GradeDetailView";

const subjects = [
  { id: 1, name: "Mathematics", gradeId: 1, versionCount: 2 },
  { id: 2, name: "English", gradeId: 1, versionCount: 0 },
];

describe("GradeDetailView", () => {
  afterEach(() => cleanup());

  it("renders a back link to Grades and a card per subject with its syllabus version count", () => {
    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    expect(screen.getByRole("link", { name: /grades/i })).toHaveAttribute("href", "/dashboard/grades");
    expect(screen.getByRole("link", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByText("2 syllabus versions")).toBeInTheDocument();
    expect(screen.getByText("0 syllabus versions")).toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    await userEvent.type(screen.getByLabelText("Search subjects..."), "Math");
    expect(screen.getByRole("link", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "English" })).not.toBeInTheDocument();
  });

  it("adds a subject through the modal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "Science", gradeId: 1, versionCount: 0 }), { status: 201 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([...subjects, { id: 3, name: "Science", gradeId: 1, versionCount: 0 }]), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add Subject" }));
    await userEvent.type(screen.getByLabelText("Subject name"), "Science");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("link", { name: "Science" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows the delete-blocked banner in place of the footer on a deletable:false response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Has syllabus or scheduling history", deletable: false }), { status: 400 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    const mathCard = screen.getByRole("link", { name: "Mathematics" }).closest("div")!.parentElement!;
    await userEvent.click(within(mathCard).getByRole("button", { name: "Actions for Mathematics" }));
    await userEvent.click(within(mathCard).getByText("Delete"));

    expect(
      await within(mathCard).findByText("Has syllabus or scheduling history and cannot be deleted.")
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("switches to list view and shows the same subjects in a table", async () => {
    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Mathematics" })).toBeInTheDocument();
  });

  it("surfaces a non-blocked delete failure as a visible top-level error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Something went wrong deleting the subject" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    const mathCard = screen.getByRole("link", { name: "Mathematics" }).closest("div")!.parentElement!;
    await userEvent.click(within(mathCard).getByRole("button", { name: "Actions for Mathematics" }));
    await userEvent.click(within(mathCard).getByText("Delete"));

    expect(await screen.findByText("Something went wrong deleting the subject")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/grade-detail-view.test.tsx`
Expected: FAIL — the current `GradeDetailView` has no back link, no `PageHeader`, no search box, no cards, no Grid/List toggle, and no modal.

- [ ] **Step 3: Rewrite `GradeDetailView.tsx`**

Replace the entire contents of `apps/web/src/components/school-setup/GradeDetailView.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Modal } from "./Modal";
import { PageHeader } from "./PageHeader";
import { GridToolbar } from "./GridToolbar";
import { EntityCard } from "./EntityCard";
import { Pagination } from "./Pagination";

export interface SubjectRow {
  id: number;
  name: string;
  gradeId: number;
  versionCount: number;
}

type ModalState = { mode: "create" } | null;

const PAGE_SIZE = 8;

function versionLabel(count: number): string {
  return `${count} syllabus version${count === 1 ? "" : "s"}`;
}

export function GradeDetailView({
  gradeId,
  gradeName,
  initialSubjects,
}: {
  gradeId: number;
  gradeName: string;
  initialSubjects: SubjectRow[];
}) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch(`/api/grades/${gradeId}/subjects`);
    setSubjects(await response.json());
  }

  function openCreate() {
    setModalState({ mode: "create" });
    setName("");
    setError(null);
  }

  function closeModal() {
    setModalState(null);
    setError(null);
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch(`/api/grades/${gradeId}/subjects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.status === 201) {
      closeModal();
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/subjects/${id}`, { method: "DELETE" });
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

  const filteredSubjects = useMemo(
    () => subjects.filter((subject) => subject.name.toLowerCase().includes(search.toLowerCase())),
    [subjects, search]
  );
  const totalPages = Math.max(1, Math.ceil(filteredSubjects.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageSubjects = filteredSubjects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/grades"
        className="flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Grades
      </Link>

      <PageHeader
        icon={BookOpen}
        title={gradeName}
        subtitle={`${subjects.length} Subject${subjects.length === 1 ? "" : "s"}`}
        action={
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Add Subject
          </button>
        }
      />

      <GridToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search subjects..."
        view={view}
        onViewChange={(value) => {
          setView(value);
          setPage(1);
        }}
      />

      {error && !modalState && <p className="text-sm text-red-600">{error}</p>}

      {pageSubjects.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No subjects found</p>}

      {pageSubjects.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pageSubjects.map((subject) => (
            <EntityCard
              key={subject.id}
              icon={BookOpen}
              href={`/dashboard/grades/${gradeId}/subjects/${subject.id}`}
              title={subject.name}
              subtitle={versionLabel(subject.versionCount)}
              menuItems={[{ label: "Delete", destructive: true, onClick: () => handleDelete(subject.id) }]}
              blockedMessage={
                deleteBlockedId === subject.id
                  ? "Has syllabus or scheduling history and cannot be deleted."
                  : undefined
              }
              blockedActions={
                deleteBlockedId === subject.id ? (
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

      {pageSubjects.length > 0 && view === "list" && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Name</th>
              <th className="border-b border-gray-200 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageSubjects.map((subject) => (
              <tr key={subject.id}>
                <td className="border-b border-gray-100 py-2">
                  <Link
                    href={`/dashboard/grades/${gradeId}/subjects/${subject.id}`}
                    className="text-blue-600 underline"
                  >
                    {subject.name}
                  </Link>
                </td>
                <td className="border-b border-gray-100 py-2">
                  {deleteBlockedId === subject.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-700">Has syllabus or scheduling history.</span>
                      <button
                        type="button"
                        onClick={() => setDeleteBlockedId(null)}
                        className="rounded border border-amber-300 px-2 py-1 text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => handleDelete(subject.id)} className="text-red-600 underline">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={filteredSubjects.length}
        onPageChange={setPage}
        itemLabel="subjects"
      />

      {modalState && (
        <Modal onClose={closeModal}>
          <h2 className="text-sm font-bold text-neutral-800">Add Subject</h2>
          <input
            type="text"
            aria-label="Subject name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Mathematics"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
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

Note: `totalPages` is computed but only used to derive `currentPage`; this mirrors the exact pattern in `GradesView.tsx`.

- [ ] **Step 4: Update `page.tsx` to drop the raw `<h1>`**

In `apps/web/src/app/dashboard/grades/[id]/page.tsx`, replace the return block:

```tsx
  return (
    <div className="p-6">
      <GradeDetailView gradeId={gradeId} gradeName={grade.name} initialSubjects={subjects} />
    </div>
  );
```

(This replaces the existing `<div className="p-6"><h1 ...>{grade.name}</h1><GradeDetailView .../></div>` block. The imports, auth check, `notFound()` guards, and data fetching above it are unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/grade-detail-view.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 6: Run the full web test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — confirms Tasks 1–3's shared-component changes didn't break `GradesView`/`ClassesView`/`EntityCard`/`GridToolbar` tests, and the subject API route tests (which call `listSubjects`/`createSubject`) still pass with the new `versionCount` field.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/school-setup/GradeDetailView.tsx apps/web/src/app/dashboard/grades/[id]/page.tsx apps/web/tests/grade-detail-view.test.tsx
git commit -m "feat: redesign grade detail page as a card grid"
```

---

### Task 5: Manual verification in-browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and open a grade detail page**

Run the app (`npm run dev` in `apps/web`, or the project's existing dev script) and sign in as an admin. Navigate to `/dashboard/grades`, click into any grade card to reach `/dashboard/grades/[id]`.

- [ ] **Step 2: Verify the redesigned layout**

Confirm: a `← Grades` back link is visible above the header and returns to `/dashboard/grades` when clicked; the header shows a book icon, the grade name, and a subject count subtitle; subjects render as cards with a syllabus-version-count subtitle; the search box filters cards by name; the Grid/List toggle switches to the table view and back.

- [ ] **Step 3: Verify add/delete behavior**

Click `+ Add Subject`, create a subject through the modal, confirm it appears as a new card. Delete a subject with no history via its kebab menu and confirm it disappears immediately. If a subject with syllabus history is available, delete it and confirm the card shows the blocked message with a Cancel button instead of disappearing.

- [ ] **Step 4: Verify pagination (if reachable)**

If the school has more than 8 subjects for one grade, confirm the pagination control appears and pages correctly; otherwise this can be skipped (already covered by the `Pagination` component's existing unit tests and the `GradesView` clamp-to-valid-page test, which exercises the same component).

No commit for this task — it's verification only.
