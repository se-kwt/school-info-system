# Admin: School Setup — Design Spec

Status: Approved — 2026-07-06

## 1. Scope and Motivation

Foundation (schema/auth/RBAC) and the Web Dashboard Shell (login + navigation) are both merged, but the system currently has no way to create real data — the only school, class, staff, student, and parent records that exist come from a hardcoded seed script (`prisma/fixtures.ts`) meant for testing. This blocks every planned feature (Attendance, Assignments, Marks, Fees), since none of them have real students or classes to attach data to.

This sub-project gives the Admin role the ability to:
1. Create classes.
2. Create staff accounts (Teacher, Admin, Accountant), optionally assigning a new Teacher to a class + subject in the same step.
3. Create students, linking them to an existing or newly-created parent account in the same step.
4. View lists of all of the above.

**Explicitly out of scope:**
- Creating additional schools (single-school MVP; multi-tenancy is a later phase).
- Edit or delete for any of the above — create + view only. Editing/removing people is rare early on and can be a fast follow-up once real usage surfaces what's actually needed.
- A separate "assign teacher to class" screen — assignment happens inline during staff creation only, for this sub-project.
- A separate "link parent" screen — linking happens inline during student creation only.

## 2. Architecture

No database schema changes are needed — `School`, `Class`, `User`, `Student`, `ParentStudent`, and `ClassTeacher` all already exist from Foundation.

**Pattern consistency:** new functionality follows the exact patterns already established, rather than introducing new ones:
- New Next.js API routes (one per resource, following the shape of Foundation's `send-otp`/`verify-otp` and the dashboard shell's `session`/`logout` routes), each protected by `requireRole`/`requireDashboardRole` restricted to `["admin"]`.
- Plain client-side forms using `fetch`, mirroring the login page's two-step pattern — no Server Actions. Server Actions were considered as a lower-boilerplate alternative but rejected: they'd be a new pattern inconsistent with everything built so far, and harder to unit-test with the "import the handler directly and call it" approach used throughout Foundation and the Web Dashboard, which is a testing precedent worth preserving.
- Every route scopes reads/writes to `claims.schoolId` from the verified session — never a client-supplied school ID, consistent with the RBAC-scoping principle established in Foundation's `getStudentsForParent`/`getClassesForTeacher`.

**Navigation:** the sidebar currently has "Students" but no "Classes" or "Staff" entries. This sub-project adds "Classes" and "Staff" as new admin-only nav items in `getNavItemsForRole`, and upgrades the existing "Students" placeholder page into the real student list + creation form.

## 3. Screens

**`/dashboard/classes`**
- List of existing classes (name, section).
- "Create Class" form: name, section.
- On submit: `POST /api/classes`.

**`/dashboard/staff`**
- List of existing staff (name, phone, role, and — for teachers — their assigned class/section/subject if any).
- "Create Staff" form: name, phone, role (dropdown: teacher/admin/accountant). If role is "teacher," an additional class dropdown and subject text field appear to optionally create the class assignment in the same submission.
- On submit: `POST /api/staff`.

**`/dashboard/students`** (replaces the current placeholder)
- List of existing students (name, admission number, class/section, linked parent name(s)/phone(s)).
- "Create Student" form: name, date of birth, class (dropdown), admission number, parent phone. If the parent phone doesn't match an existing account, a "Parent name" field appears to create that account in the same submission.
- On submit: `POST /api/students`.

All three pages are Server Components for the initial list (fetched via Prisma directly, same pattern as the existing `/dashboard` welcome page), with a client-component form for the create action that `fetch`-posts and then reloads/revalidates the list.

## 4. API Contracts

All routes below require an admin session (`requireRole`/`requireDashboardRole(["admin"])`) and scope every operation to `claims.schoolId` from the verified session.

### Classes

**`GET /api/classes`**
Response `200`: `Array<{ id: number; name: string; section: string }>`

**`POST /api/classes`**
Request body: `{ name: string; section: string }`
- `201`: `{ id: number; name: string; section: string }`
- `409`: `{ error: "A class with this name and section already exists" }` — if `(schoolId, name, section)` already exists (matches the existing `@@unique([schoolId, name, section])` constraint on `Class`)
- `400`: `{ error: "name and section are required" }` — if either field is missing

### Staff

**`GET /api/staff`**
Response `200`: `Array<{ id: number; name: string; phone: string; role: "teacher" | "admin" | "accountant"; classAssignment: { className: string; section: string; subject: string } | null }>`
(`classAssignment` is populated only for teachers with a `ClassTeacher` row; always `null` for admin/accountant.)

**`POST /api/staff`**
Request body: `{ name: string; phone: string; role: "teacher" | "admin" | "accountant"; classId?: number; subject?: string }`
- `201`: `{ id: number; name: string; phone: string; role: string }`
- `409`: `{ error: "This phone number is already registered" }` — if `phone` already exists on any `User` row (matches `User.phone` unique constraint)
- `400`: `{ error: "name, phone, and role are required" }` — if any required field is missing, or if `role` is not one of the three valid values
- `400`: `{ error: "subject is required when assigning a class" }` — if `classId` is provided without `subject`
- If `role === "teacher"` and both `classId` and `subject` are provided, a `ClassTeacher` row is created in the same request (both the `User` and `ClassTeacher` creates happen in one Prisma transaction, so a failure creating the class link doesn't leave an orphaned staff account)

### Students

**`GET /api/students`**
Response `200`: `Array<{ id: number; name: string; admissionNo: string; class: { name: string; section: string }; parents: Array<{ name: string; phone: string }> }>`

**`POST /api/students`**
Request body: `{ name: string; dob: string; classId: number; admissionNo: string; parentPhone: string; parentName?: string }` (`dob` as an ISO date string, e.g. from an HTML `<input type="date">`)
- `201`: `{ id: number; name: string; admissionNo: string }`
- `409`: `{ error: "A student with this admission number already exists" }` — matches `Student.admissionNo` unique constraint
- `409`: `{ error: "This phone number is already registered as a different role" }` — if `parentPhone` matches an existing `User` whose `role` is not `parent`
- `400`: `{ error: "name, dob, classId, admissionNo, and parentPhone are required" }` — if any required field is missing
- `400`: `{ error: "parentName is required to create a new parent account" }` — if `parentPhone` doesn't match any existing `User` and `parentName` wasn't provided
- The student create, the (conditional) new-parent-user create, and the `ParentStudent` link create all happen in one Prisma transaction

**Validation pattern:** every uniqueness conflict is checked explicitly (via a `findUnique`/`findFirst` before the write, or by catching Prisma's `P2002` error code) and translated into the specific `409` messages above — never a raw Prisma constraint error surfaced to the client, matching Foundation's `sendOtp`/`PHONE_NOT_REGISTERED` handling style.

## 5. Testing

Consistent with the project's established approach — Vitest tests for the API routes (using the seeded/reset test database, following the exact pattern of `session-route.test.ts`), and manual browser verification for the UI screens (no component tests for these forms, since they're structurally simple and the login page already established the component-testing pattern if a future sub-project needs it again):
- `POST /api/classes`: creates successfully; rejects a duplicate name+section with 409; rejects a missing field with 400.
- `POST /api/staff`: creates a non-teacher successfully; creates a teacher with a class assignment successfully (and verifies the `ClassTeacher` row exists); rejects a duplicate phone with 409; rejects a teacher-with-`classId`-but-no-`subject` with 400.
- `POST /api/students`: creates a student linked to an existing parent; creates a student and a new parent in one request; rejects a duplicate admission number with 409; rejects a `parentPhone` belonging to a non-parent role with 409; rejects a new `parentPhone` with no `parentName` with 400.
- `GET` routes: each returns the expected shape for seeded data, scoped correctly to `schoolId` (a record belonging to a different school must not appear).

## 6. Out of Scope (explicitly deferred)

- Editing or deleting classes, staff, or students.
- A dedicated "reassign teacher" or "re-link parent" screen.
- Creating additional schools.
- Bulk import (e.g. CSV upload of a student roster) — every record is created one at a time through these forms for now.
