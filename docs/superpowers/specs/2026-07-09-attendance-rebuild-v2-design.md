# Attendance Rebuild (Card UI) v2 — Design Spec

Status: Approved — 2026-07-09

Supersedes [2026-07-09-attendance-rebuild-design.md](2026-07-09-attendance-rebuild-design.md) entirely. That spec was written against a `Student.classId`/`Student.rollNumber`/`Student.photoUrl` model. A merge from `claude/vigilant-dhawan-259a67` (commit `05ef0c2`) brought in an Academic Year / `Enrollment` schema restructuring: `Student` no longer has `classId`/`section`, and class membership + roll number are now per-academic-year via a new `Enrollment` model. The merge also reverted that branch's own attendance-card rebuild and photo-upload work, so none of that exists in the current tree — only the schema restructuring landed. This document redesigns the same card-based marking flow against the schema as it now actually exists.

## 1. Scope and Motivation

Same end-user goal as before: replace the table-based teacher attendance flow with a card-based UI (photo, name, roll number, click-to-cycle status, bulk actions, review-before-submit). The only thing that changed is the data model underneath.

**In scope:**
1. Card-based attendance marking UI for teachers (unchanged from v1 in behavior).
2. Adding `Student.photoUrl` and enforcing uniqueness on the already-existing `Enrollment.rollNumber`.
3. Extending the already-existing student create/edit flow (`StudentsView.tsx`, `createStudent`/`editStudent`) to set `rollNumber`/`photoUrl`, plus re-adding the photo upload endpoint (reverted by the merge).
4. Fixing a merge bug: `apps/web/prisma/fixtures.ts` passes `rollNumber` to `prisma.student.create`, a field that doesn't exist on `Student` — it belongs on the `Enrollment` create call.

**Explicitly out of scope (unchanged from v1):**
- Admin's read-only attendance view, the per-student note field, and the month% column — dropped from the card component entirely.
- External object storage for photos — local disk under `apps/web/public/uploads/students/`.
- Image processing (crop/resize) or bulk photo import.
- General student edit beyond roll number/photo — `editStudent` already handles name/dob/admissionNo/class; this adds two more fields to that existing surface, nothing more.
- Removing the "late" status from the domain model.

## 2. Schema Changes

```prisma
model Student {
  ...
  photoUrl String?
  ...
}

model Enrollment {
  ...
  @@unique([classId, academicYearId, rollNumber])
}
```

- `Student.photoUrl` is nullable — a student's photo is a property of the person, not of a given year's enrollment, so it stays on `Student` (unlike `rollNumber`, which is legitimately per-year).
- `Enrollment.rollNumber` already exists (`String?`) and is untouched in type — only the compound unique index is new. Prisma/Postgres treat `NULL` as distinct in a unique index, so multiple students with no roll number set don't collide; only two *set* values colliding within the same class+year is rejected.
- One migration covering both.

## 3. Fix the Merge Bug

`apps/web/prisma/fixtures.ts` currently has:
```ts
const student = await prisma.student.create({
  data: { schoolId: school.id, name: "Rohan Sharma", dob: new Date("2015-04-12"), admissionNo: "GH-2026-001", rollNumber: "GH-2026-001" },
});
```
`rollNumber` isn't a `Student` field — this doesn't compile against the current schema. Move it to the existing `enrollment.create` call a few lines below (which currently sets `studentId, classId, academicYearId, status` but not `rollNumber`).

## 4. Student Roll Number & Photo — Create/Edit/Upload

**`createStudent(prisma, schoolId, academicYearId, input)`** — `input` gains optional `rollNumber?: string` (written onto the `Enrollment` row created in the same transaction) and optional `photoUrl?: string` (written onto `Student`). Pre-check for `rollNumber` uniqueness within `(classId, academicYearId)` before the transaction, mirroring the existing `admissionNo` pre-check; catch `P2002` on the compound index as a TOCTOU backstop, same pattern as `isUniqueConstraintViolation` already used. New `DUPLICATE_ROLL_NUMBER` result case.

**`editStudent(prisma, params)`** — `params.fields` gains optional `rollNumber?: string` and optional `photoUrl?: string`. `rollNumber` updates the `Enrollment` row for `params.academicYearId` (same enrollment lookup path already used for `classId` reassignment — if there's no active enrollment and `rollNumber` was supplied, return the existing `NO_ACTIVE_ENROLLMENT` error). `photoUrl` updates `Student` directly (no enrollment dependency). Same `DUPLICATE_ROLL_NUMBER` handling as `createStudent`.

**`POST /api/students/upload-photo`** (re-added, was reverted) — `requireApiRole(["admin"])`, accepts `multipart/form-data` with a `file` field, validates `image/png`/`image/jpeg`/`image/webp` and a 2MB cap, saves to `apps/web/public/uploads/students/<uuid>.<ext>`, returns `{ photoUrl }`. Client uploads first, then includes the returned URL in the normal JSON create/edit call — same two-step design as v1, since the existing create/edit routes are JSON-bodied and reworking them to multipart isn't warranted for one field.

**`StudentsView.tsx`** — add a roll number text input and a photo file input to both the create form and the inline per-row edit UI, wired the same two-step way (upload-then-submit) as the student form.

## 5. Attendance Roster & Submit — Architecture (mostly unchanged from v1)

`RosterEntry` in `attendance.ts` (already `Enrollment`-aware via `getEnrolledStudents`) gains:
```ts
export interface RosterEntry {
  studentId: number;
  name: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: AttendanceStatus | null;
  note: string | null;
  monthPercent: number;
}
```
`getAttendanceRoster` already calls `getEnrolledStudents(prisma, { classId, academicYearId })` — extend that helper (or the roster mapping) to also return each student's `rollNumber` from their `Enrollment` row for that class+year, and `photoUrl` from `Student`.

`markAttendance` gains the same v1 change: `entries[].status` widens to `"present" | "absent" | "late" | null`; a `null` entry does `prisma.attendance.deleteMany({ where: { studentId, date } })` instead of upserting, so resetting a card to unmarked actually removes a previously-submitted record rather than leaving it stale. Everything else about `markAttendance` (the `ClassTeacher` + `academicYearId` assignment check, the enrolled-count `STUDENT_MISMATCH` check) is unchanged.

## 6. Card UI — Architecture (unchanged from v1)

Same component split and behavior as the v1 spec, now consuming the extended `RosterEntry`:

- **`AttendanceView.tsx`** (client) — class + date selectors (unchanged), fetches the roster, holds `statusMap: Record<studentId, "present"|"absent"|"late"|null>`, header row with **Mark All Present**, **Mark All Absent**, **Reset**, a card grid, and a **Submit All** pill.
- **`StudentAttendanceCard.tsx`** — avatar (`photoUrl` if present, else initials-on-neutral-circle), name, and roll number *if set* (a student with no `rollNumber` shows no roll-number line at all, rather than a placeholder implying one exists). Background/border colored by status (emerald/red/amber/neutral). Click cycles `null → present → absent → late → null`.
- **`AttendanceReviewPanel.tsx`** (modal) — opened by "Submit All", lists students currently `absent`, `late`, or `null`, each still click-to-cycle adjustable, with "Back" and "Confirm & Submit".
- **Bulk actions**: Mark All Present/Absent overwrite every card's status unconditionally; Reset sets every card to `null`. Local state only until submit.
- **Admin fallback**: same thin, non-interactive card grid (no bulk actions, no Submit pill) as v1 — still not a designed admin experience, deferred.

## 7. Testing

- `createStudent`/`editStudent`: roll number uniqueness within `(classId, academicYearId)` — duplicate rejected, same number in a different class or year accepted; `photoUrl` round-trips on both create and edit.
- `POST /api/students/upload-photo`: same validation tests as v1 (rejects non-image, rejects >2MB, rejects non-admin, accepts a valid image).
- `markAttendance`: null-status entry deletes an existing row; null-status entry with no existing row is a no-op; mixed present/absent/late/null entries in one call all apply correctly in a single transaction.
- Component-level: `StudentAttendanceCard` click-cycles through the four states in order and omits the roll-number line when `rollNumber` is null; `AttendanceView`'s bulk actions and review-panel wiring; `AttendanceReviewPanel` filters to only absent/late/null and reflects live edits.
- `fixtures.ts` fix: seeding via `createSeedFixtures` succeeds without a Prisma validation error (regression test for the bug in §3).

## 8. Out of Scope (explicit)

- Admin read-only attendance view, notes, month% (dropped, not redesigned).
- External object storage for photos.
- Image processing (crop/resize) or bulk photo import.
- General student edit beyond roll number/photo.
- Removing the "late" status from the domain model.
