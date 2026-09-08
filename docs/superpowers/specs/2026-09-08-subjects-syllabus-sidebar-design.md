# Subjects & Syllabus: dedicated sidebar item

## Problem

Subjects and syllabus versions are currently only reachable by drilling into the
Grades module (`/dashboard/grades/[id]` → subject list → `/dashboard/grades/[id]/subjects/[subjectId]`
→ syllabus versions). The sidebar's own "Subjects" and "Syllabus" nav entries
point at "Coming Soon" stub pages and are unused.

## Goal

Give Subjects/Syllabus their own sidebar entry, fully separate from the Grades
module. Flow: list all Grades → click one → see its subjects → click a subject
→ see its syllabus versions. No data-model or API changes; this is a routing
and navigation move.

## Nav change (`apps/web/src/lib/dashboard/nav-items.ts`)

Remove the two placeholder groups ("Subjects", "Syllabus") from the Academic
section. Replace them with a single top-level leaf in the same position:

```ts
{ href: "/dashboard/subjects", label: "Subjects", icon: "BookMarked", roles: ["admin"] }
```

## Route tree

- `/dashboard/subjects` (new) — lists all Grades as cards (name + subject
  count). New component `SubjectsView`, browse-only: no create/edit/delete.
  Grade CRUD stays exclusively in the Grades module.
- `/dashboard/subjects/[gradeId]` (new, moved from `/dashboard/grades/[id]`) —
  reuses `GradeDetailView` (add/delete subjects, syllabus-version counts).
  Back-link changes from "← Grades" (`/dashboard/grades`) to "← Subjects"
  (`/dashboard/subjects`). Subject cards link to
  `/dashboard/subjects/[gradeId]/[subjectId]`.
- `/dashboard/subjects/[gradeId]/[subjectId]` (new, moved from
  `/dashboard/grades/[id]/subjects/[subjectId]`) — reuses `SyllabusHistoryView`.
  Adds a "← <Grade name>" back-link to `/dashboard/subjects/[gradeId]` (the
  old page had none). Also now validates the subject belongs to `gradeId`
  (tightening the existing lookup, which previously ignored the grade
  segment of the URL entirely).

## Removed

- `apps/web/src/app/dashboard/grades/[id]/page.tsx`
- `apps/web/src/app/dashboard/grades/[id]/subjects/[subjectId]/page.tsx`
- `apps/web/src/app/dashboard/subjects/add/page.tsx` (unused stub; subject
  creation happens via the modal on the grade's subject list, not a route)
- `apps/web/src/app/dashboard/syllabus/page.tsx`
- `apps/web/src/app/dashboard/syllabus/add/page.tsx`

No changes to `/api/grades/[id]/subjects`, `/api/subjects/*`, or any
`lib/school-setup/subjects.ts` functions — only the pages that call them move.

## Component changes

- **`EntityCard`**: `href` becomes optional (when absent, the title renders as
  plain text instead of a `Link`), and the kebab menu is omitted when
  `menuItems` is empty, instead of always rendering an empty-menu button.
- **`GradesView`**: grade cards no longer pass `href` (grid view) and no
  longer wrap the name in a `Link` (list view) — clicking a grade card does
  nothing now; Edit/Delete continue to work via the kebab menu (grid) and the
  Edit/Delete buttons (list view). This is intentional: the Grades module no
  longer owns a path into subjects.
- **`GradeDetailView`**: back-link href/label and subject-card hrefs updated
  to the new `/dashboard/subjects/...` paths (see Route tree above).
- **New `SubjectsView`** (`components/school-setup/SubjectsView.tsx`): grade
  picker. `PageHeader` (title "Subjects", subtitle "Select a grade to view its
  subjects"), `GridToolbar` (search + grid/list toggle, no year filter),
  `EntityCard` per grade — each card links to `/dashboard/subjects/[gradeId]`,
  with no `onEdit` and no `menuItems` (browse-only, so the kebab menu is
  omitted).

## Testing

- `nav-items.test.ts`: existing href-existence check self-validates the new
  route; no per-item assertions reference the removed groups.
- `grade-detail-view.test.tsx`: update back-link href/label assertion.
- `grades-view.test.tsx`: update card assertions from `getByRole("link", ...)`
  to `getByText(...)` since cards are no longer links.
- `entity-card.test.tsx`: add a case covering the no-`href` (plain text)
  render.
- New `subjects-view.test.tsx` for the grade-picker component.
- New page-level test(s) covering the moved `[gradeId]/[subjectId]` route's
  gradeId validation, if a page-level test pattern already exists for
  sibling routes (otherwise this is covered by lib-level tests plus the
  component test for `SyllabusHistoryView`, which is unchanged).
