# Parent Dashboard Update — Design

Date: 2026-07-13
Phase: 1 of 3 (Parent Dashboard → Assignment Module → Teacher Attendance)

## Context

The parent-facing dashboard (`apps/web/src/app/parent/`) already supports multiple
children per parent account (`ParentStudent` many-to-many join model) with a working
student selector (`ChildSwitcher`) and four summary widgets (Attendance, Assignments,
Marks, Fees). This phase updates the header to show school/student identity and
reorders the widgets, per the request. It does not touch the Assignment Module or
Teacher Attendance — those are separate phases with their own specs.

## Goals

1. Show school logo, school name, active student's name, grade, and section at the
   top of the parent experience.
2. Reorder dashboard widgets to: Pending Assignments, Attendance Summary, Fee Due
   Status, Marks/Exam Results.
3. Confirm the existing student selector satisfies the "multiple students" requirement
   (it does — no functional change required).

## Non-goals

- Assignment creation/editing, file upload, notifications (Phase 2).
- Attendance marking permission rules (Phase 3).
- Any change to parent authentication or the `ParentStudent` data model.

## Design

### 1. School logo (schema + upload)

- Add `logoUrl String?` to the `School` model in `apps/web/prisma/schema.prisma`.
- New endpoint `apps/web/src/app/api/school/logo/route.ts` (POST, admin-only),
  mirroring the existing pattern in
  `apps/web/src/app/api/students/upload-photo/route.ts`:
  - Accepts multipart form data with a `file` field.
  - Validates content type (PNG/JPEG/WebP) and size (≤2MB).
  - Writes to `public/uploads/school/<uuid>.<ext>`.
  - Updates `School.logoUrl` and returns the new URL.
- Build a "School Profile" section into the currently-stubbed
  `apps/web/src/app/dashboard/settings/page.tsx` (admin-only), with a logo upload
  control and preview, replacing the `ComingSoon` placeholder for this section only.
- `apps/web/src/app/parent/layout.tsx` renders the logo next to the school name.
  Falls back to an initials-style placeholder (reusing the existing initials pattern
  already used for the profile menu avatar) when `logoUrl` is null.

### 2. Student info banner (dashboard page only)

- Added to `apps/web/src/app/parent/page.tsx` only — not the shared layout — since
  student resolution today happens per-page via the `?studentId=` query param, and
  extending that to the layout would require broader plumbing changes affecting all
  parent sub-pages. Out of scope for this phase.
- Rendered just below the header, above/alongside `ChildSwitcher`.
- Shows: student name, grade (`Class.name`), section (`Class.section`) for the active
  child's current-year enrollment.
- Requires extending the `activeEnrollment` query inside `getParentOverview`
  (`apps/web/src/lib/parent/overview.ts`) to `include: { class: true }`, and adding
  `className` / `section` fields to the returned `ParentOverview` shape.
- If a student has no active enrollment (edge case, e.g. between academic years),
  the banner shows the student name only and omits grade/section rather than
  erroring.

### 3. Widget reorder + rename

In `apps/web/src/app/parent/page.tsx`, reorder the 4-card grid to:

1. Pending Assignments (existing `AssignmentsCard`, data already pending-only —
   top 3 by due date, no logic change)
2. Attendance Summary (existing `AttendanceCard`)
3. Fee Due Status (existing `FeesCard`)
4. Marks / Exam Results (existing `MarksCard`)

Label-only renames in `apps/web/src/components/parent/SummaryCards.tsx`:
- "Assignments" → "Pending Assignments"
- "Attendance" → "Attendance Summary"
- "Fees" → "Fee Due Status"

`MarksCard`'s "Marks" label may stay as-is or become "Marks / Exam Results" — pick
whichever reads better in the actual card width; this is a cosmetic call made during
implementation, not a decision point.

### 4. Student selector

No changes. `ChildSwitcher` (`apps/web/src/components/parent/ChildSwitcher.tsx`)
already renders a card-style selector fed by the existing `ParentStudent` many-to-many
relation, and already refreshes the dashboard via `?studentId=` navigation. Confirmed
sufficient for the "multiple students" requirement.

## Data flow

```
parent/page.tsx
  → getParentChildren(prisma, userId)       // unchanged
  → resolveActiveChild(children, studentId) // unchanged
  → getParentOverview(prisma, { studentId, schoolId })
        → now also returns { className, section } from Enrollment.class
  → renders: header (layout, school logo) 
             → student info banner (name/grade/section)
             → ChildSwitcher
             → 4-card grid in new order
```

## Testing

- Unit test for extended `getParentOverview` covering: student with active
  enrollment (returns class/section), student with no active enrollment (omits
  them without throwing).
- Component/snapshot test for the reordered grid and renamed card labels.
- Manual browser verification:
  - Single-child parent account — header, banner, reordered widgets render.
  - Multi-child parent account — switching students updates the banner and widgets.
  - Admin uploads a school logo — appears in parent header; parent view without a
    logo shows the placeholder.

## Open items carried to later phases

- Assignment Module (file upload, notifications, pending/completed split, teacher
  status marking) — Phase 2.
- Teacher Attendance permission rules (edit-today-only, admin override) — Phase 3.
