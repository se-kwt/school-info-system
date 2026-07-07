# Classes/Staff/Students — Edit & Delete Design Spec

Status: Approved — 2026-07-07

## 1. Scope and Motivation

Classes, Staff, and Students admin pages are currently create-only (matching the "Exam pattern" noted in the Fees design). This sub-project adds Edit and Delete to all three.

The complication: since the Academic Year retrofit, `Class`, `Student`, and staff `User` rows are referenced by a web of historical data (`Enrollment`, `Attendance`, `Mark`, `FeePayment`, `AssignmentStatus`, `ClassTeacher`, `TimetableEntry`, `PromotionLogEntry`) with no cascading deletes. A literal "Delete" would either be blocked by a foreign-key violation the moment any history exists, or would have to destroy that history — directly conflicting with the point of the Academic Year work. This spec resolves that by making Delete conditional: a real delete only when there's truly nothing to lose, a deactivate/archive fallback otherwise.

**Explicitly out of scope:**
- Bulk edit/delete (one row at a time only, matching every other admin action in this codebase).
- Re-activating a deactivated/archived row — that's a natural, small follow-up once this ships, not bundled in here.
- Any change to the Promotion Wizard's own student-status transitions (`left`/`transferred`/`graduated`/`inactive` set during promotion) — this spec's "deactivate" is a separate, always-available admin action, not a promotion decision.

## 2. Delete Eligibility Rules

For each entity, Delete checks for real history first. Clean → hard delete (in one transaction, including the entity's purely-structural roster rows). Otherwise → deactivate/archive.

**Student** — hard-deletable only if it has zero rows in `Attendance`, `Mark`, `FeePayment`, `AssignmentStatus`, `PromotionLogEntry`, and no more than the one `Enrollment` row created at signup (a student who has ever been promoted/retained has 2+ enrollments and is never hard-deletable). Clean case: delete `Student`, its single `Enrollment`, and its `ParentStudent` link(s) together. Otherwise: set `Student.status = "inactive"` and set their active-year `Enrollment.status = "inactive"`.

**Staff** — hard-deletable only if zero rows in `Attendance.markedBy`, `Assignment.createdBy`, `FeePayment.recordedBy`, `TimetableEntry.teacherUserId`, `PromotionRun.initiatedBy`. Their `ClassTeacher` row(s) do not by themselves block deletion (structural, like a student's Enrollment) and are deleted alongside the user in the clean case. A staff member can never delete or deactivate their own logged-in account. Otherwise: set `User.status = "inactive"` and delete their current-year `ClassTeacher` row (if any).

**Class** — hard-deletable only if it has zero `Enrollment`, `ClassTeacher`, `TimetableEntry`, `Assignment`, `FeeStructure`, or `PromotionMapping` rows (as either `fromClassId` or `toClassId`). Otherwise: set `Class.archived = true`.

## 3. Schema Changes

```prisma
enum UserStatus {
  active
  inactive
}

model User {
  // ...existing fields...
  status UserStatus @default(active)
}

model Class {
  // ...existing fields...
  archived Boolean @default(false)
}
```

`Student` needs no schema change — `Student.status` (including `"inactive"`) already exists from the Academic Year work.

**Auth impact:** `sendOtp` (`src/lib/auth/send-otp.ts`) gains one check — if the looked-up user has `status: "inactive"`, it responds exactly as it does for an unregistered phone (no OTP sent, same outcome), so deactivation revokes login without leaking account existence.

**Class picker impact:** `listClasses` (used as the class-picker source on Students, Staff, Attendance, Timetable, and Fees pages) gains an implicit `archived: false` filter by default. The Classes admin page itself calls a variant that includes archived classes, displayed with an "Archived" badge, so admins can still find and reference them.

## 4. Edit Scope

Edit opens an expandable panel below the row (not a modal, not a separate page) with labeled fields and Save/Cancel.

- **Class:** `name`, `section`. `409` on duplicate `(schoolId, name, section)`, excluding the row being edited.
- **Staff:** `name`, `phone`, `role`, and — only when `role` is `"teacher"` — a class + subject dropdown for their current-year `ClassTeacher` assignment. `409` on duplicate `phone` (excluding self). Changing `role` away from `"teacher"` clears any existing assignment; submitting a non-`"teacher"` role together with a `classId`/`subject` is a `400`. If no academic year is active, the assignment field is omitted from the panel (nothing to assign against).
- **Student:** `name`, `dob`, `admissionNo`, and — only if the student currently has an active-year `Enrollment` — a class dropdown that updates that `Enrollment.classId` in place. `409` on duplicate `admissionNo` (excluding self). If there's no active academic year, or the student has no active-year enrollment (e.g. already graduated), the class field is omitted from the panel.

## 5. API Contracts

All routes below require `requireApiRole(["admin"])`.

### `PATCH /api/classes/:id`
Body: `{ name?, section? }`.
- `404` if the class doesn't belong to the caller's school.
- `409 { error: "A class with this name and section already exists" }` on duplicate.
- Success `200 { ok: true }`.

### `DELETE /api/classes/:id`
- `404` if not found / cross-school.
- Hard-delete path: `200 { ok: true, deleted: true }`.
- Blocked path: `400 { error: "This class has enrollment or scheduling history and cannot be deleted", deletable: false }` — the UI then offers "Archive instead," which calls:

### `PATCH /api/classes/:id/archive`
Body: none. Sets `archived: true`. Success `200 { ok: true }`. `404` if not found/cross-school.

### `PATCH /api/staff/:id`
Body: `{ name?, phone?, role?, classId?: number | null, subject?: string | null }`.
- `404` if not found/cross-school.
- `409 { error: "This phone number is already registered" }` on duplicate.
- `400 { error: "Only a teacher can have a class assignment" }` if the request body explicitly includes a non-null `classId` or `subject` while the resulting role (the new `role` if given, else the existing one) is not `"teacher"` — a genuinely contradictory request. This is distinct from the *silent* side effect below: if `role` changes away from `"teacher"` and the request simply omits `classId`/`subject` (doesn't mention them at all), any existing assignment is cleared automatically, no error.
- `400 { error: "subject is required when assigning a class" }` if `classId` is set without `subject`.
- Success `200 { ok: true }`.

### `DELETE /api/staff/:id`
- `403 { error: "You cannot delete your own account" }` if `id === claims.userId`.
- `404` if not found/cross-school.
- Hard-delete path: `200 { ok: true, deleted: true }`.
- Blocked path: `400 { error: "This staff member has recorded activity and cannot be deleted", deletable: false }`, UI offers "Deactivate instead," which calls:

### `PATCH /api/staff/:id/deactivate`
- `403` if targeting self.
- Sets `status: "inactive"`, deletes their current-year `ClassTeacher` row if any. Success `200 { ok: true }`.

### `PATCH /api/students/:id`
Body: `{ name?, dob?, admissionNo?, classId?: number }`.
- `404` if not found/cross-school.
- `409 { error: "A student with this admission number already exists" }` on duplicate.
- `400 { error: "This student has no active enrollment to reassign" }` if `classId` given but no active-year `Enrollment` exists for them.
- `400 { error: "The selected class does not exist" }` if `classId` doesn't belong to the school.
- Success `200 { ok: true }`.

### `DELETE /api/students/:id`
- `404` if not found/cross-school.
- Hard-delete path: `200 { ok: true, deleted: true }`.
- Blocked path: `400 { error: "This student has recorded history and cannot be deleted", deletable: false }`, UI offers "Deactivate instead," which calls:

### `PATCH /api/students/:id/deactivate`
Sets `Student.status: "inactive"` and, if an active-year `Enrollment` exists, sets its `status: "inactive"` too. Success `200 { ok: true }`.

## 6. UI Behavior

Each table row gains **Edit** and **Delete** buttons (Classes/Staff/Students pages).

- **Edit** expands the row-attached panel described in §4; Save calls the corresponding `PATCH`, Cancel collapses without saving.
- **Delete** shows a confirm prompt. It first calls `DELETE`; if the response is the "blocked" `400` shape (`deletable: false`), the confirm UI swaps to "{name} has recorded history and can't be permanently deleted. Deactivate instead?" and, on confirmation, calls the `.../archive` or `.../deactivate` endpoint instead. This keeps it a single guided flow for the admin rather than two separate buttons.
- Deactivated/archived rows remain visible in their table (not hidden) with an "Inactive"/"Archived" badge next to their name, so admins can still find and reference them — they simply drop out of class/staff pickers used elsewhere (Students/Staff/Attendance/Timetable/Fees creation flows already scope to non-archived classes and, per the login change, deactivated staff can no longer authenticate).

## 7. Testing

Left to the implementation plan, per the established Vitest + real-seeded-data pattern used by every prior module.
