# Attendance Rebuild (Card UI) — Design Spec

Status: Approved — 2026-07-09

Supersedes the teacher-facing marking flow described in [2026-07-06-attendance-design.md](2026-07-06-attendance-design.md) section 3 (table-based roster + inline `<select>`). That spec's API contracts, admin read-only view, notes field, and month% definition remain the reference for those still-existing pieces; this document describes what changes and what's added.

## 1. Scope and Motivation

The existing `/dashboard/attendance` page uses a table with an inline status `<select>` per row. This rebuild replaces the teacher-facing marking flow with a card-based UI: one card per student (photo, name, roll number), color-coded by status, click-to-cycle marking, bulk actions, and a review step before final submission.

**In scope:**
1. Card-based attendance marking UI for teachers (this document's main focus).
2. Adding `rollNumber` and `photoUrl` to `Student`, since cards need both and neither exists today.
3. A minimal photo upload capability and student edit page, since there's currently no way to attach a photo to an existing student (create-only, JSON body, no file handling anywhere in the app).

**Explicitly out of scope (carried over or newly deferred):**
- Admin's read-only attendance view, the per-student note field, and the month% column — dropped from this component entirely. A future pass may redesign the admin view separately; it is not addressed here.
- The "late" status is **kept** (the DB enum already has it and removing it would need a migration + touch other features' assumptions like month% elsewhere), but is treated as a fully equivalent third markable state alongside present/absent.
- Photo upload via external object storage (S3-compatible, etc.) — local disk storage is used instead (see §3). Revisit if the app moves to serverless/ephemeral-filesystem hosting.
- Bulk student photo import, cropping/resizing UI, or any image processing — raw uploaded file is stored as-is (with basic type/size validation only).
- A general-purpose student edit page beyond what's needed for `rollNumber`/`photoUrl` — no editing of `name`/`dob`/`classId`/`admissionNo` is added here, since those aren't part of this feature's scope. (If useful this may be broadened later, but is not designed here.)

## 2. Schema Changes

```prisma
model Student {
  ...
  rollNumber  String
  photoUrl    String?
  ...

  @@unique([classId, rollNumber])
}
```

- `rollNumber` is required, manually entered by the admin (like `admissionNo` today), unique **within a class** (not globally — two students in different classes may share a roll number).
- `photoUrl` is nullable. `null` means "no photo uploaded" — the card falls back to an initials avatar.
- New Prisma migration via `npm run prisma:migrate`. Existing seeded/test students need a backfill value for `rollNumber` in the migration or seed script, since the column is non-null on a table that likely already has rows.

## 3. Student Photo Upload & Minimal Edit Page

This is prerequisite plumbing the card UI depends on; it's the only part of this spec that touches admin-facing screens rather than the teacher attendance flow.

**Upload endpoint — `POST /api/students/upload-photo`**
- `requireApiRole(["admin"])`.
- Accepts `multipart/form-data` with a single `file` field.
- Validates content-type is an image (`image/png`, `image/jpeg`, `image/webp`) and a max size (e.g. 2MB) — reject with `400` otherwise.
- Writes to `apps/web/public/uploads/students/<uuid>.<ext>`, returns `200 { photoUrl: "/uploads/students/<uuid>.<ext>" }`.
- This is a separate endpoint (not folded into student create/edit) so the existing JSON-body create/edit flows don't need to be reworked into multipart parsing — the client uploads the file first, gets back a URL, then includes that URL in the normal JSON payload.

**`CreateStudentForm.tsx` changes**
- Add `rollNumber` text input (required).
- Add a file input for photo (optional). On submit: if a file is chosen, `POST` it to the upload endpoint first, then include the returned `photoUrl` (or `undefined`) in the existing JSON `POST /api/students` call.
- `createStudent` in `src/lib/school-setup/students.ts` accepts `rollNumber` (required) and `photoUrl` (optional), surfaces a `DUPLICATE_ROLL_NUMBER`-style error (reusing the existing `prisma-errors.ts` pattern for `P2002` unique-constraint mapping) if `(classId, rollNumber)` collides.

**New minimal edit page**
- `apps/web/src/app/dashboard/students/[id]/edit/page.tsx` — admin-only (`requireDashboardRole(["admin"])`), server component, loads the one student by id (404/redirect if not found or wrong school).
- `EditStudentForm.tsx` — client component, same shape as create but pre-filled, editing only `rollNumber` and photo (re-uses the upload endpoint). Submits `PATCH /api/students/[id]`.
- New route `apps/web/src/app/api/students/[id]/route.ts` — `PATCH`, admin-only, scoped to `schoolId`, updates `rollNumber`/`photoUrl`, same duplicate-roll-number error handling as create.
- Students list page (`/dashboard/students`) gets an "Edit" link per row, admin-only, matching the existing `isAdmin`-conditional pattern already used there.

## 4. Attendance Card UI — Architecture

Component split, following the page → View → sub-component pattern established by Assignments/`AssignmentRoster`:

- **`page.tsx`** (`/dashboard/attendance`) — unchanged: `requireDashboardRole(["teacher", "admin"])`, fetches the class list, renders `<AttendanceView>`. (Admin still reaches this page but, per §1, no longer gets a read view here — see note below.)
- **`AttendanceView.tsx`** (client) — class selector, date picker (kept, editable to any date, defaulting to today), fetches the roster via the existing `GET /api/attendance`. Holds `statusMap: Record<studentId, "present" | "absent" | "late" | null>` in local state, seeded from the fetched roster's `status` field per student. Renders:
  - Header row: **Mark All Present**, **Mark All Absent**, **Reset** buttons.
  - A responsive card grid.
  - A **Submit All** pill button (fixed position or at the bottom of the grid).
- **`StudentAttendanceCard.tsx`** (presentational, client) — avatar (`photoUrl` image if present, else initials-on-neutral-circle fallback), name, roll number. Background/border colored by status: emerald for present, red for absent, amber for late, neutral for null. `onClick` cycles status `null → present → absent → late → null`. Receives `status` and `onClick` as props — no internal fetching.
- **`AttendanceReviewPanel.tsx`** (client, modal overlay) — opened by "Submit All". Filters the current `statusMap` to students who are `absent`, `late`, or `null`. Renders the same card-style click-to-cycle control for each so the teacher can adjust before finalizing. Has "Back" (closes, returns to the grid, no changes lost — same `statusMap` reference in the parent) and "Confirm & Submit" (triggers the actual save).

**Admin path note:** since the admin read-only view/notes/month% are dropped (§1) but the page still gates on `["teacher", "admin"]` for routing history reasons, admin visiting `/dashboard/attendance` after this change needs *something* rendered. Simplest: keep admin seeing the same class/date selector, but render the grid as non-interactive (cards displayed with their status color, `onClick` disabled, no bulk-action buttons, no Submit pill). This is a thin fallback, not a designed admin experience — a real admin view is future work per §1.

**Bulk actions:** Mark All Present/Absent set every student in `statusMap` to that status, unconditionally overwriting any prior per-card state (including cards already manually set in the current session). Reset sets every student to `null`. These only mutate local state — nothing is persisted until "Confirm & Submit" succeeds.

## 5. Submit Flow & API Changes

`AttendanceReviewPanel`'s "Confirm & Submit" triggers `AttendanceView`'s save handler, which `POST`s to `/api/attendance` with one entry per student in `statusMap` (all of them, not just the reviewed subset — present-and-untouched students need to be included too):

```
{
  classId: number;
  date: string;
  entries: Array<{ studentId: number; status: "present" | "absent" | "late" | null }>
}
```

(`note` is dropped from the payload — no note field in this UI.)

**`markAttendance` in [attendance.ts](../../../apps/web/src/lib/attendance.ts) changes:**
- `entries[].status` type widens to include `null`.
- For entries with a non-null status: unchanged `upsert` behavior.
- For entries with `status: null`: instead of upserting, `prisma.attendance.deleteMany({ where: { studentId, date: targetDate } })` — this is the "unmark" case, handling a student who had a prior record for that date (e.g. marked present yesterday's session, now reset to null in this one) and needs that record actually removed, not left stale.
- Still one `$transaction` wrapping the mix of upserts and deletes, preserving the existing all-or-nothing guarantee.
- `STUDENT_MISMATCH` validation (every `studentId` belongs to `classId`) is unchanged and applies to all entries regardless of status.

After a successful submit: `AttendanceView` refetches the roster (existing pattern), closes the review panel, shows a success message (existing `message`/`error` state pattern).

## 6. Testing

- `markAttendance`: null-status entry deletes an existing row; null-status entry with no existing row is a no-op; mixed present/absent/late/null entries in one call all apply correctly in a single transaction; existing `NOT_ASSIGNED`/`STUDENT_MISMATCH` cases still pass with `null` included in the entries.
- `POST /api/students/upload-photo`: rejects non-image content-type, rejects oversized file, accepts a valid image and returns a `photoUrl` that resolves under `public/uploads/students/`.
- `(classId, rollNumber)` uniqueness: creating/editing a student with a roll number already used in the same class fails with the mapped duplicate error; the same roll number in a different class succeeds.
- `PATCH /api/students/[id]`: admin-only (403 for teacher), scoped to `schoolId` (404/400 for a student in another school), updates `rollNumber`/`photoUrl`.
- Component-level: `StudentAttendanceCard` click cycles through the four states in order; `AttendanceView`'s Mark All Present/Absent/Reset overwrite all cards; `AttendanceReviewPanel` correctly filters to only absent/late/null students and reflects live edits back into the shared state.

## 7. Out of Scope (explicit)

- Admin read-only attendance view, notes, month% (dropped, not redesigned).
- External object storage for photos.
- Image processing (crop/resize) or bulk photo import.
- General student edit beyond roll number/photo.
- Removing the "late" status from the domain model.
