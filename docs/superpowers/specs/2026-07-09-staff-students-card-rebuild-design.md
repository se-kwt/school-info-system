# Staff & Students Page Rebuild (Card UI) + Sidebar Collapse — Design Spec

Status: Approved — 2026-07-09

## 1. Scope and Motivation

The Staff and Students admin pages (`StaffView.tsx`, `StudentsView.tsx`) are currently plain HTML tables with an inline create form above them and Edit/Delete as text links that expand an inline row panel. This spec replaces both with a card-grid UI: photo/avatar cards, a header with filtering and an "Add new" pill button, and a click-to-open detail popup that is directly editable with a pill-shaped Save button. It also adds a collapsible sidebar to the dashboard shell.

This is a UI-only rebuild. All backend logic already exists and is reused unchanged:
- `listStaff`, `editStaff`, `deleteStaff`, `deactivateStaff`, `activateStaff` ([staff.ts](../../../apps/web/src/lib/school-setup/staff.ts))
- `listStudents`, `editStudent`, `deleteStudent`, `deactivateStudent`, `activateStudent` ([students.ts](../../../apps/web/src/lib/school-setup/students.ts))
- The corresponding `/api/staff/*` and `/api/students/*` routes, including `POST /api/students/upload-photo`.

**Explicitly out of scope:**
- Any schema, API contract, or `lib/school-setup/*` changes — every field, error code, and endpoint used below already exists.
- Adding a photo field to `User` (staff). Staff avatars are initials-only; no migration.
- Bulk actions, pagination, or server-side search — the existing pages load the full school-scoped list client-side already, and this rebuild keeps that.
- Changing the create-student admin gate (`isAdmin`) or any RBAC behavior.
- Re-activating a deactivated/archived row from anywhere other than the existing "Activate" action, now relocated into the popup.

## 2. Staff Page

### Header
- Page title ("Staff").
- **Role filter**: a `<select>` with options All / Teacher / Admin / Accountant. Purely client-side filtering of the already-loaded `staff` array — no new API calls.
- **"Add new staff"** pill button, right-aligned, opens the popup in create mode.

### Card grid
Responsive grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`-style, matching existing Tailwind conventions in the codebase). Each card shows:
- Circular initials avatar (same `initials()` helper pattern as `StudentAttendanceCard.tsx`), colored background.
- Name.
- Role badge (capitalized).
- If the staff member is a teacher with a `classAssignment`: a small line `{className} {section} · {subject}`.
- If `status === "inactive"`: an "Inactive" badge.
- Card is a `<button>` (whole card clickable) that opens the popup in view/edit mode for that staff member, except it's still rendered (not hidden) for the current logged-in user's own card — clicking it opens the popup but the popup omits Delete/Deactivate (see below).

### Detail/Edit popup
One modal component (`StaffDetailModal`), shared between "Add new staff" (create mode, no initial data, no Delete section) and "click a card" (edit mode, pre-filled, Delete section shown unless it's the current user's own card).

Fields, all editable inline (matching current `StaffView` inline-edit field set exactly — no new fields):
- Name (text)
- Phone (tel)
- Role (select: teacher/admin/accountant)
- If role === teacher: Class assignment (select, "No class assignment" default) + Subject (text, required only if a class is selected)

Footer:
- **Save** — pill button (`rounded-full`), calls `POST /api/staff` in create mode or `PATCH /api/staff/:id` in edit mode with the same body shape the current `StaffView` builds (`classId`/`subject` set to `null` when role isn't teacher or no class chosen). On success, closes the popup and refreshes the grid. On error, shows the server's error message inline in the popup (same messages as today: duplicate phone, role/class mismatch, subject required, no active year).
- **Delete** (edit mode only, hidden entirely on the current user's own card) — calls `DELETE /api/staff/:id`. On success (`{ deleted: true }`), closes popup and refreshes. On the blocked response (`deletable: false`), the popup swaps this button's area to the existing confirm text + "Deactivate instead" button (`PATCH /api/staff/:id/deactivate`) + "Cancel", exactly the same two-step flow as the current inline row UI, just relocated into the popup.
- If `status === "inactive"` (edit mode), an **Activate** button also appears (`PATCH /api/staff/:id/activate`), reusing the existing endpoint.
- **Cancel/close** (X or backdrop click) discards changes without saving.

## 3. Students Page

### Header
- Page title ("Students").
- **Class filter**: a `<select>` defaulting to "All classes", plus one option per class from the `classes` prop already passed to `StudentsView`. Purely client-side filtering of the loaded `students` array by `student.class` matching the selected class's name+section — no new API calls. "All classes" shows everyone (including unassigned).
- **"Add new student"** pill button — admin-only (same `isAdmin` gate as today), right-aligned. Opens the popup in create mode. If a specific class is currently selected in the filter (not "All classes"), that class is pre-selected in the create form's class field; "All classes" leaves the create form's class field at its current default (first class in the list, matching today's behavior).

### Card grid
Each card shows:
- Circular photo (`student.photoUrl`) or initials avatar fallback (same pattern as `StudentAttendanceCard.tsx`).
- Name.
- Roll no. (if set).
- Class (`{name} {section}` or "Unassigned").
- Status badge if not `"active"` (`inactive`/`left`/`transferred`/`graduated`).
- Whole card is a `<button>` opening the popup in view/edit mode. Non-admin (teacher) users can still open the popup to view details but the popup hides Save/Delete/Activate for them, matching today's `isAdmin`-gated action visibility (view-only for teachers).

### Detail/Edit popup
One modal component (`StudentDetailModal`), shared for create/edit, admin-only for the edit actions.

Fields (matching current `StudentsView` inline-edit field set exactly):
- Name (text)
- Date of birth (date)
- Admission number (text)
- Roll number (text, optional)
- Photo (file input; on Save, if a new file was chosen, upload it first via `POST /api/students/upload-photo` then include the returned `photoUrl` in the save payload — same two-step flow already implemented in `StudentsView.handleSaveEdit`/`handleCreate`)
- Class (select) — shown whenever the student has an active-year enrollment (edit mode) or always (create mode), matching today's conditional (`{student.class && (...)}`)
- Create mode only, additionally: Parent phone (tel), Parent name (text, only required if that phone isn't already a registered parent) — the two fields `StudentsView` currently collects at creation.

Footer: same Save / Delete→Deactivate-fallback / Activate / Cancel pattern as Staff, calling the equivalent `/api/students/*` endpoints already used by the current `StudentsView` (`POST /api/students`, `PATCH /api/students/:id`, `DELETE /api/students/:id`, `PATCH /api/students/:id/deactivate`, `PATCH /api/students/:id/activate`).

## 4. Shared Pieces

- Pill button style: `rounded-full` with the existing color tokens used elsewhere (e.g. `bg-[#14B8A6]` accent or `bg-neutral-900` per existing dashboard conventions) — exact color chosen to match the current design system at implementation time, not a new palette.
- The popup itself: a centered modal with backdrop, following whatever lightweight modal pattern already exists in this codebase (if none exists, a small local `Modal` component using a fixed-position backdrop + `useEffect` escape-key/backdrop-click-to-close, no new dependency).
- Both `StaffDetailModal` and `StudentDetailModal` are separate components (field sets differ enough that a shared generic modal isn't worth the abstraction) but may share a small `Modal` shell component for backdrop/close behavior.
- Error messages surfaced in the popup are the exact strings the APIs already return — no new copy to invent.

## 5. Sidebar Collapse

`apps/web/src/app/dashboard/layout.tsx`'s `<aside>` becomes collapsible via a new small client component, e.g. `SidebarShell` wrapping the existing aside markup:

- A toggle button (chevron icon) placed at the top of the sidebar, near the logo.
- Expanded: current 260px width, full content (logo text, nav labels, pinned classes, user card with name/role, Logout button text).
- Collapsed: ~64px icon-only rail — nav item icons remain visible and clickable (same `href`s), text labels (`item.label`, section headers "Main Menu"/"Workspace"/"Pinned Classes", school name/subtitle, user name/role text) are hidden. The user avatar and Logout button remain as icon-only (Logout as an icon button).
- State persisted in `localStorage` (e.g. key `sidebar-collapsed`), read on mount via `useEffect` (default expanded on first-ever load, matching SSR-safe hydration — render expanded on the server and correct from `localStorage` client-side after mount, accepting a one-frame flash on first paint, same tradeoff any client-persisted UI toggle in a server-rendered Next.js app accepts).
- No change to `navItems`/`WORKSPACE_NAV_ITEMS`/`getNavItemsForRole` data or any route — purely a presentational wrapper around the existing `<aside>` markup already in `layout.tsx`.

## 6. Testing

- No new API/lib behavior to unit-test (nothing in `lib/school-setup/*` changes).
- Manual verification in-browser (per this codebase's established pattern for pure-UI rebuilds, e.g. the attendance card rebuild): log in as admin, open `/dashboard/staff`, filter by role, add a new staff member via the popup, open an existing card and edit+save it, attempt delete on a staff member with history (confirm the deactivate fallback appears in-popup), confirm the current user's own card hides Delete. Repeat the equivalent flow on `/dashboard/students` including photo upload and the class filter. Toggle the sidebar collapse, reload the page, confirm the collapsed state persists.
