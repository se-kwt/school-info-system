# Assignment Module Update — Design

Date: 2026-07-13
Phase: 2 of 3 (Parent Dashboard → Assignment Module → Teacher Attendance)

## Context

The assignment module (`apps/web/src/app/api/assignments/`, `apps/web/src/lib/assignments.ts`,
`apps/web/src/components/assignments/`, `apps/web/src/app/parent/assignments/`) already
supports: teacher create/edit forms (subject, title, description, due date), per-student
pending/submitted status marking by the teacher (no student upload portal — this already
matches the "Version 1" submission workflow in the request), and a parent-facing list of
all assignment statuses for the active child. A `Notification` model exists in the schema
but is entirely unused; `NotificationBell` is a static "coming soon" stub.

This phase adds: file attachments on assignments, a pending/completed split on the parent
side, and in-app notifications when an assignment is published. Email/WhatsApp
notifications are explicitly deferred, per the request.

## Goals

1. Teachers can attach one file (PDF, PNG, JPEG, or WebP) to an assignment when creating
   or editing it.
2. `/parent/assignments` shows only pending (including overdue) assignments; a new
   `/parent/assignments/completed` page shows submitted ones.
3. When a teacher publishes (creates) an assignment, every linked parent gets an in-app
   notification, visible via a real notification center replacing the current stub.

## Non-goals

- Student upload portal (explicitly excluded from Version 1 per the request).
- Email or WhatsApp notifications (deferred to a later phase).
- Multiple attachments per assignment.
- Teacher-side (`/dashboard/notifications`) notification center — out of scope; this
  phase only builds the parent-facing bell.
- Changes to Parent Dashboard (Phase 1) or Teacher Attendance (Phase 3).

## Design

### 1. File attachment

- Add to the `Assignment` model in `apps/web/prisma/schema.prisma`:
  - `attachmentUrl String?`
  - `attachmentName String?` (the original filename, so parents see e.g.
    "Worksheet_Ch4.pdf" instead of a generated UUID)
- New endpoint `apps/web/src/app/api/assignments/upload/route.ts` (POST, teacher-only),
  following the exact pattern of `apps/web/src/app/api/students/upload-photo/route.ts`:
  - Allowed types: `image/png`, `image/jpeg`, `image/webp`, `application/pdf`.
  - Max size: 2MB (same limit as existing upload endpoints).
  - Saves to `public/uploads/assignments/<uuid>.<ext>`, returns
    `{ attachmentUrl, attachmentName }` where `attachmentName` is the original
    `file.name` from the upload.
- `createAssignment` and `editAssignment` in `apps/web/src/lib/assignments.ts` accept
  optional `attachmentUrl`/`attachmentName` fields; the `POST /api/assignments` and
  `PATCH /api/assignments/[id]` routes pass them through unchanged (no new validation
  beyond "both present or both absent").
- `AssignmentsView.tsx`'s create form and `AssignmentRoster.tsx`'s edit form each add a
  file input. Selecting a file immediately calls the new upload endpoint (mirroring how
  `StudentDetailModal` handles photo selection) and stores the returned URL/name in
  component state; the value is included in the subsequent create/save request.
- Any assignment view that already renders assignment details (parent assignments page,
  parent completed page, teacher `AssignmentRoster`) shows a "View attachment" link
  (`<a href={attachmentUrl} target="_blank">{attachmentName}</a>`) when `attachmentUrl`
  is set, and nothing otherwise.

### 2. Parent pending vs. completed split

- `getParentAssignmentHistory` in `apps/web/src/lib/parent/assignments-history.ts` gains
  an optional `status?: "pending" | "submitted"` filter parameter:
  - `"pending"` → entries whose computed `displayStatus` is `"pending"` or `"overdue"`.
  - `"submitted"` → entries whose computed `displayStatus` is `"submitted"`.
  - omitted → current behavior (all), used by no caller after this phase but kept for
    flexibility/tests.
- `apps/web/src/app/parent/assignments/page.tsx` calls it with `status: "pending"` and
  adds a link to the new completed page (`/parent/assignments/completed?studentId=...`).
- New `apps/web/src/app/parent/assignments/completed/page.tsx`, structurally identical to
  the existing page (same `ChildSwitcher`, same list rendering) but calling
  `getParentAssignmentHistory` with `status: "submitted"` and linking back to
  `/parent/assignments`.

### 3. In-app notifications

- Inside the existing `prisma.$transaction` in `createAssignment` (right after the
  `AssignmentStatus` rows are created), look up the parents linked to each enrolled
  student via `ParentStudent` and create one `Notification` row per parent:
  - `type: "assignment_published"`
  - `title`: the assignment title
  - `body`: `"${subject} · Due ${dueDate}"`
  - `relatedId`: the new assignment's id
  - If a parent has more than one child in the class (unlikely but possible), they still
    get exactly one notification per assignment (dedupe by parent user id).
- New endpoints:
  - `apps/web/src/app/api/notifications/route.ts` (GET): returns the current user's
    notifications ordered by `createdAt desc` (most recent 20) plus an `unreadCount`.
  - `apps/web/src/app/api/notifications/[id]/read/route.ts` (POST): sets `readAt` on a
    notification belonging to the current user; 404 if it belongs to someone else.
- Replace `apps/web/src/components/parent/NotificationBell.tsx`'s stub body with a real
  client component: fetches `/api/notifications` on mount, shows an unread-count badge
  on the bell icon, and a dropdown listing each notification's title + relative date.
  Clicking a notification calls the mark-read endpoint (optimistically updates local
  state) and navigates to `/parent/assignments`.

## Data flow

```
Teacher publishes assignment
  → POST /api/assignments { classId, subject, title, description, dueDate,
                             attachmentUrl?, attachmentName? }
  → createAssignment(prisma, {...})
       → creates Assignment row
       → creates AssignmentStatus rows (one per enrolled student, "pending")
       → creates Notification rows (one per distinct linked parent)

Parent views assignments
  → /parent/assignments           → getParentAssignmentHistory(..., { status: "pending" })
  → /parent/assignments/completed → getParentAssignmentHistory(..., { status: "submitted" })
  → NotificationBell → GET /api/notifications → { notifications, unreadCount }
                     → POST /api/notifications/:id/read on click
```

## Testing

- `createAssignment`: attachment fields persisted when provided; one `Notification` per
  distinct linked parent is created; no duplicate notification when a parent has two
  children in the same class.
- `editAssignment`: attachment fields can be added/changed via PATCH.
- `getParentAssignmentHistory`: `status: "pending"` includes overdue and excludes
  submitted; `status: "submitted"` includes only submitted.
- API tests for `/api/assignments/upload` (valid PDF/image accepted, non-allowed type
  and oversized file rejected, non-teacher rejected) mirroring
  `students-upload-photo-api.test.ts`.
- API tests for `GET /api/notifications` and `POST /api/notifications/[id]/read`
  (returns only the caller's own notifications, 404 on someone else's id).
- Component tests for the file-input additions to `AssignmentsView`/`AssignmentRoster`
  and for the rebuilt `NotificationBell` (badge count, list rendering, mark-read).
- Manual browser check: teacher creates an assignment with an attachment → parent sees
  it under Pending with a working attachment link and a notification badge appears →
  teacher marks it Submitted → it disappears from Pending and appears under Completed.

## Open items carried to later phases

- Teacher Attendance permission rules (edit-today-only, admin override) — Phase 3.
- Email/WhatsApp notification delivery — future phase, not scheduled.
- Teacher-side notification center (`/dashboard/notifications`) — future phase, not
  scheduled.
