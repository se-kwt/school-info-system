# Grades & Classes card-grid redesign

## Context

The Grades and Classes admin pages (`/dashboard/grades`, `/dashboard/classes`) are currently
plain HTML tables with inline create/edit forms (`GradesView.tsx`, `ClassesView.tsx`). The user
supplied a mockup screenshot of a card-grid layout (search + filter + view toggle + a responsive
grid of grade cards + pagination) and asked for the Grades and Classes pages to be redesigned to
match it, using the app's existing fonts/sizes rather than introducing new ones.

This is a visual/UX redesign of two existing, fully-functional CRUD views. All existing
behavior (create, edit, delete-with-history-guard, archive/unarchive for classes) must be
preserved — only the presentation layer and a couple of small, targeted backend additions change.

## Goals

- Redesign `/dashboard/grades` and `/dashboard/classes` to a card-grid layout matching the
  mockup's visual language, reusing the app's existing type scale and neutral-gray design
  language (no new fonts, no new color system).
- Add a working Grid/List toggle, where List reuses the existing table markup.
- Add a working search box (client-side, by name) and an academic-year filter dropdown.
- Add client-side pagination.
- Move create/edit/delete interactions from inline table rows to modals (reusing the existing
  `Modal.tsx`).
- Add active-route highlighting to the sidebar so the current page is visually indicated (small,
  directly motivated by the mockup showing "Grades" highlighted).

## Non-goals

- No changes to the shared dashboard header (`app/dashboard/layout.tsx`'s "Welcome, {name}" bar) —
  no search bar / notification bell / avatar dropdown added there. Confirmed out of scope with
  the user.
- No new design system / component library beyond the small set of pieces described below.
- No backend pagination — data volumes here are small (tens of grades/classes per school), and
  client-side pagination is sufficient.
- No changes to auth, RBAC, or the underlying create/edit/delete/archive business logic in
  `lib/school-setup/grades.ts` and `lib/school-setup/classes.ts` beyond the additive changes
  described below.

## Shared components (new)

All new files live in `apps/web/src/components/school-setup/`:

- **`PageHeader.tsx`** — icon badge + title + subtitle + right-aligned action button slot.
  Props: `icon` (Lucide icon component), `title`, `subtitle`, `action` (ReactNode).
- **`GridToolbar.tsx`** — search input + a filter `<select>` + Grid/List toggle buttons.
  Props: `searchValue`, `onSearchChange`, `filterValue`, `onFilterChange`, `filterOptions`
  (`{ value, label }[]`), `view` (`"grid" | "list"`), `onViewChange`.
- **`EntityCard.tsx`** — generic card: icon badge, title (as a `next/link`), subtitle, an
  optional line of tag text (subject names / archived status), a footer badge, an `Edit` button,
  and a `KebabMenu` slot. Props are plain data + callbacks; Grades and Classes each render their
  own `<EntityCard>` with their own field mapping — no grade/class-specific logic lives inside
  `EntityCard` itself.
- **`KebabMenu.tsx`** — small "..." button that toggles a dropdown of `{ label, onClick,
  destructive? }` items, closes on outside click / Escape.
- **`Pagination.tsx`** — "Showing X–Y of Z {label}" text + prev/next chevron buttons, disabled at
  bounds. Props: `page`, `pageSize`, `total`, `onPageChange`, `itemLabel` (e.g. `"grades"`).

Styling conventions to follow (matching existing components like `KpiCard.tsx`/`StudentCard.tsx`):
- Cards: `rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]`
- Icon badges: colored-tint rounded box (e.g. `rounded-xl bg-indigo-50 text-indigo-600 p-2`)
- Micro-labels/badges: `text-[10px]`/`text-[11px]` per existing convention
- Grid breakpoints: `grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (matches
  `StudentsView.tsx`/dashboard KPI grid convention)
- No `next/font` addition — default Tailwind sans stack stays as-is.

## Grades page

### Card fields
- Icon: `Layers` (matches the existing sidebar nav icon for Grades)
- Title: grade name, links to `/dashboard/grades/[id]`
- Subtitle: `{subjectCount} Subjects • {classCount} Classes`
- Tag line: comma-joined subject names, `line-clamp-1`; `"No subjects yet"` in `text-neutral-400`
  when empty
- Footer: `Classes {classCount}` pill badge (left) + `Edit` button (right) + kebab menu (`Delete`)

### Toolbar
- Search: client-side substring filter on grade name
- Filter dropdown: academic years (from `listAcademicYears`), default option `"All Years"`.
  Selecting a year does **not** hide grades — it re-scopes each card's `classCount` (and the
  page's underlying data fetch) to that year's classes. Selecting "All Years" shows the
  all-time aggregate (current/existing behavior).
- View toggle: Grid (new cards) / List (existing table, reusing current row markup)

### Backend changes
- `lib/school-setup/grades.ts`: `listGrades` gains an optional `academicYearId?: number` param.
  When provided, the query's `_count.select.classes` becomes
  `{ where: { academicYearId } }` instead of `true`. `GradeSummary` gains a `subjectNames: string[]`
  field, populated via `subjects: { select: { name: true }, orderBy: { name: "asc" } }` in the
  same query (no extra round trip).
- `app/api/grades/route.ts` GET: reads an optional `academicYearId` query param (same pattern
  already used in `app/api/classes/route.ts`) and passes it through to `listGrades`.
- `app/dashboard/grades/page.tsx`: also fetches `listAcademicYears` and passes it to
  `GradesView` as a new `academicYears` prop (mirrors what `ClassesPage` already does).

### Modals
- Create: name input, reuses existing `handleCreate`/error handling, now rendered inside `Modal`.
- Edit: name input pre-filled, reuses existing `handleSaveEdit`.
- Delete: fires immediately from the kebab menu, no confirm step — matches the original table's
  one-click delete behavior; server-side guards already block deleting anything with real history.
  On `deletable: false` response, swaps that card's footer for the existing "has subjects or
  classes and cannot be deleted" message with a Cancel button (no archive option for grades —
  none exists today). (Amended post-implementation: the design originally called for a confirm
  modal here; the implementation matched the original page's behavior instead, and this was
  confirmed as the intended behavior during final review rather than adding a confirm step.)

## Classes page

### Card fields
- Icon: `Building2` (matches the existing sidebar nav icon for Classes)
- Title: `{gradeName} · Section {section}`, links to `/dashboard/classes/[id]` (route already
  exists)
- Subtitle: academic year name
- Status: `Archived` pill (`bg-neutral-200 text-neutral-600`) shown only when `archived: true`;
  no pill for active classes
- Footer: `Edit` button + kebab menu (`Delete`; `Archive` or `Unarchive` depending on state)

### Toolbar
- Search: client-side substring filter on `"{gradeName} {section}"`
- Filter dropdown: academic years, default `"All Years"`. Unlike Grades, this **does** filter
  which classes are shown — reuses the existing `academicYearId` support already in
  `listClasses` / `GET /api/classes`.
- View toggle: Grid / List (existing table markup)

### Backend changes
None required — `listClasses` and `GET /api/classes` already accept `academicYearId` and
`includeArchived`.

### Modals
- Create: Grade select + Section input + Academic Year select, reuses existing `handleCreate`.
- Edit: Section input pre-filled (grade/year are not currently editable via the existing
  `handleSaveEdit` path — preserved as-is), reuses existing logic.
- Delete: fires immediately from the kebab menu, no confirm step (see the equivalent note under
  Grades above). On `deletable: false`, swaps that card's footer for the existing "has history and
  cannot be permanently deleted" message with `Archive instead` + `Cancel` buttons, reusing
  existing `handleArchive`.

## Pagination

- Page size: 8 per page (2 rows × 4 columns on wide viewports) for both Grades and Classes grids
  and their list-view equivalents.
- Resets to page 1 on: search text change, filter (year) change, or grid/list toggle change.
- Fully client-side; no API changes.

## Sidebar active-state (small, targeted fix)

`components/dashboard/Sidebar.tsx` currently has no active-route logic (`navLinkClass` is
static). Add `usePathname()` from `next/navigation` and apply an active style (background tint +
accent text, consistent with the mockup's highlighted "Grades" row) when `item.href` matches (or
prefixes, for nested routes like `/dashboard/grades/[id]`) the current pathname. This is the only
change to `Sidebar.tsx` — no other sidebar behavior changes.

## Error / empty states

- No search/filter results → centered `"No grades found"` / `"No classes found"` message in the
  grid/list area.
- Create/Edit modal errors render as the existing inline red error text above the form actions;
  modal stays open on error.
- All existing API error messages and status-code handling are preserved unchanged — only where
  and how they're displayed changes (inline row → modal).

## Testing

- Existing tests that exercise `GradesView`/`ClassesView` inline-table interactions will need to
  be updated to drive the new modal-based flows (open modal → fill field → submit) instead of
  inline row editing. Existing tests for `listGrades`, `listClasses`, and the API routes should
  continue to pass unchanged except where new optional params are exercised.
- Add coverage for the new `academicYearId` behavior on `listGrades` (classCount scoping) and for
  the sidebar active-state highlighting.
- Manual verification in-browser: create/edit/delete a grade and a class through the new modals;
  toggle Grid/List; filter by academic year; verify pagination controls at a data volume that
  exceeds one page (may require temporarily seeding extra grades/classes, or verified with a
  lowered page size in a local check).

