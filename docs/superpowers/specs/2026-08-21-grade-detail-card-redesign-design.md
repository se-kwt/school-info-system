# Grade detail page card redesign

## Context

The Grades and Classes list pages (`/dashboard/grades`, `/dashboard/classes`) were recently
redesigned to a card-grid layout (see
[2026-08-19-grades-classes-card-redesign-design.md](2026-08-19-grades-classes-card-redesign-design.md)),
built on a set of shared components in `apps/web/src/components/school-setup/`: `PageHeader`,
`GridToolbar`, `EntityCard`, `KebabMenu`, `Pagination`, `Modal`.

The grade *detail* page (`/dashboard/grades/[id]`, rendered by `GradeDetailView.tsx`) was not
part of that redesign and still uses the old plain-table + inline-form style: an `<h1>` in
`page.tsx`, a bare text input + button to add a subject, and an HTML table of subjects with
underlined text links for view/delete.

This spec redesigns `GradeDetailView.tsx` (and the small wrapping `page.tsx`) to match the same
card-grid visual language, reusing the existing shared components. All existing behavior (add
subject, delete subject with history-guard, link through to a subject's syllabus history page)
is preserved — only the presentation layer changes, plus one small additive backend change.

## Goals

- Redesign the grade detail page to the card-grid style established by Grades/Classes, reusing
  `PageHeader`, `GridToolbar` (search + Grid/List toggle only), `EntityCard`, `KebabMenu`,
  `Pagination`, and `Modal`.
- Move "add subject" from an inline input+button into a modal (mirrors Grades' create modal).
- Add a small back-link to `/dashboard/grades` above the page header, since this is a drill-down
  page one level under the grid.
- Add a `versionCount` field to each subject so cards can show something more informative than a
  bare name.

## Non-goals

- No rename/edit capability for subjects — none exists today (`lib/school-setup/subjects.ts` has
  no update function), so the card has no Edit button, matching current behavior.
- No academic-year (or any other) filter dropdown — subjects aren't scoped by academic year.
- No changes to the syllabus-history page (`/dashboard/grades/[id]/subjects/[subjectId]`) or to
  delete/history-guard business logic in `lib/school-setup/subjects.ts` beyond the additive
  `versionCount` field.
- No backend pagination — same rationale as the Grades/Classes redesign (small data volumes).

## Component changes

### `GridToolbar.tsx` (shared, small backward-compatible change)
`filterValue`, `onFilterChange`, and `filterOptions` become optional. When `filterOptions` is
omitted, the `<select>` is not rendered. Grades and Classes pages are unaffected (they keep
passing all three).

### `GradeDetailView.tsx` (rewritten)
- `"use client"` component, same props shape as today (`gradeId`, `gradeName`,
  `initialSubjects`), but `SubjectRow` gains `versionCount: number`.
- Back-link: `← Grades` text link (`ArrowLeft` icon + text, matching the app's existing
  neutral-gray link styling) above the `PageHeader`, pointing to `/dashboard/grades`.
- `PageHeader`: icon `BookOpen`, title = `gradeName`, subtitle = `"{count} Subjects"`, action =
  `+ Add Subject` button opening the create modal.
- `GridToolbar`: search only (client-side substring filter on subject name) + Grid/List toggle;
  no filter dropdown (per the `GridToolbar` change above).
- Grid view: `EntityCard` per subject —
  - icon: `BookOpen`
  - title: subject name, links to `/dashboard/grades/{gradeId}/subjects/{subject.id}`
  - subtitle: `"{versionCount} syllabus version(s)"` (`"0 syllabus versions"` when empty, singular
    `"1 syllabus version"` when exactly one)
  - no footer badge, no Edit button (`onEdit` prop — see below)
  - kebab menu: single `Delete` item (destructive), fires immediately (no confirm), matching
    today's one-click delete
  - on `deletable: false` (`HAS_HISTORY`), swap footer for the blocked message "Has syllabus or
    scheduling history and cannot be deleted." + Cancel button, same pattern as Grades/Classes
- List view: reuses the current table markup (Name + Actions columns), delete blocked message
  shown inline in the Actions cell exactly as today.
- Pagination: `Pagination` component, page size 8, resets to page 1 on search or grid/list toggle
  change.
- Create modal: subject name input, reuses existing `handleCreate`/error handling, rendered via
  `Modal`.

### `EntityCard.tsx` (shared, small change)
`onEdit` becomes optional (`onEdit?: () => void`). When omitted, the footer renders only the
badge/kebab side — no Edit button. (Grades/Classes cards keep passing `onEdit` and are
unaffected.)

### `page.tsx` (`app/dashboard/grades/[id]/page.tsx`)
- Drop the raw `<h1>` — `GradeDetailView` now renders its own `PageHeader` and back-link.
- `prisma.grade.findFirst` query also selects each subject's syllabus-version count (or a
  follow-up `groupBy`/`count` per subject) to populate `versionCount` — done in
  `lib/school-setup/subjects.ts`'s `listSubjects`, not inline in the page, so the API route
  (`GET /api/grades/[id]/subjects`, used by `refresh()`) returns the same shape.

### `lib/school-setup/subjects.ts`
- `SubjectSummary` gains `versionCount: number`.
- `listSubjects` populates it via `_count: { select: { syllabusVersions: true } }` in the same
  query (no extra round trip), mapped to `versionCount` on each returned subject.

## Error / empty states

- No search results → centered `"No subjects found"` message in the grid/list area (mirrors
  Grades/Classes `"No grades found"`).
- Create modal errors render as existing inline red error text; modal stays open on error.
- All existing API error messages/status codes are unchanged — only where/how they render
  changes (inline row → modal, inline table cell → card blocked-state for grid view).

## Testing

- Update `tests/grades-view.test.tsx` (or add a sibling test file) to cover the new
  `GradeDetailView`: add-subject via modal, delete with history-guard blocked state, search
  filtering, Grid/List toggle, pagination boundary.
- Add/extend a `listSubjects` unit test asserting `versionCount` is populated correctly (0, 1,
  and >1 versions).
- Manual verification in-browser: add and delete a subject through the new modal/cards, toggle
  Grid/List, confirm the back-link returns to `/dashboard/grades`, confirm a subject with
  syllabus history shows the blocked-delete state instead of deleting.
