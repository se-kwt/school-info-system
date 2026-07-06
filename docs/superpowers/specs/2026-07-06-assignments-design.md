# Assignments — Design Spec

Status: Approved — 2026-07-06

## 1. Scope and Motivation

Attendance is merged — the next item on the roadmap is Assignments, the second real classroom-facing feature. This sub-project covers:

1. Teacher creating an assignment for a class they teach (subject, title, description, due date).
2. Teacher editing an assignment they created (title/subject/description/dueDate).
3. Teacher updating per-student submission status (pending/submitted) for an assignment.
4. Both Teacher and Admin viewing a class's assignment list and, per assignment, the per-student submission roster.

**Explicitly out of scope:**
- The parent/student-facing submission flow (no self-service "mark as submitted" from a student/parent) — deferred until the mobile app sub-project needs it, same reasoning as Attendance's deferred parent read API.
- Deleting an assignment.
- Changing an assignment's `classId` after creation (would orphan the per-student status rows created at assignment-creation time).
- List filtering/pagination (upcoming vs. past) — the list shows everything, sorted by due date descending.
- Admin creating or editing assignments — Admin is view-only across all classes in the school, matching Attendance.

## 2. Architecture

No database schema changes — `Assignment` and `AssignmentStatus` already exist from Foundation.

**Pattern consistency**, following Attendance and Admin School Setup exactly:
- A business-logic module (`src/lib/assignments.ts`) with testable functions, wrapped by thin API routes using `requireApiRole`.
- A single Server Component page (`/dashboard/assignments`) with role-conditional rendering (teacher gets create form + editable roster; admin gets read-only), matching the `isAdmin` conditional pattern already used elsewhere.
- Every read/write scoped by ownership: teacher access to a class is checked via `ClassTeacher` (their own classes only); admin access via `schoolId` (any class in their own school), reusing the existing `getClassesForTeacher` / `listClasses` helpers.
- **Edit is further restricted to the original creator**: `createdById === claims.userId`. Unlike Attendance (where any assigned teacher can re-mark regardless of who marked first), a different teacher assigned to the same class gets `403` on edit — an assignment has a single author, not a shared daily record.
- Creating an assignment creates one `AssignmentStatus` row per student in the class (`status: pending`) in the same `$transaction` as the `Assignment` insert — mirrors Attendance's per-student-row approach so the roster never has to handle "no row yet."
- **"Overdue" is never stored.** The `AssignmentStatusValue.overdue` enum value is a display-only derived state: a row with stored `status: pending` and `dueDate` in the past is mapped to `"overdue"` in API responses. Teachers only ever write `pending`/`submitted`; nothing writes `overdue` to the database.

## 3. Screen

**`/dashboard/assignments`** (single page, both roles):

1. **Class selector** — dropdown. Teacher: `getClassesForTeacher(prisma, claims.userId)`. Admin: `listClasses(prisma, claims.schoolId)`.
2. **Teacher only: "New Assignment" form** above the list — subject, title, description (optional), due date. Submitting posts and creates status rows for every student in the class.
3. **Assignment list** for the selected class, sorted by `dueDate` descending: title, subject, due date, a submission summary badge (e.g. "12/25 submitted"), colored consistent with existing status coloring (green = all submitted, amber = due soon, red = any overdue).
4. **Clicking a row expands/navigates into the per-student status roster** for that assignment:
   - **Teacher:** one row per student — Name, Status (editable `<select>`: pending/submitted only — "overdue" is never a selectable option, it's shown as a computed read-only badge next to a still-pending row past its due date). A single "Save" button submits every row in one request, matching Attendance's bulk-save UX. An "Edit" action is shown on assignments where `createdById === claims.userId`, opening a form for title/subject/description/dueDate.
   - **Admin:** same roster, fully read-only — no edit action shown regardless of creator, no save button.

## 4. API Contracts

### `GET /api/assignments`

Query params: `classId` (number).

Requires `requireApiRole(["teacher", "admin"])`.

- Teacher: verifies a `ClassTeacher` row exists for `(classId, teacherUserId: claims.userId)`. `403 { error: "You are not assigned to this class" }` if not.
- Admin: verifies the class exists and belongs to `claims.schoolId`. `400 { error: "The selected class does not exist" }` if not.
- `400 { error: "classId is required" }` if missing/non-numeric.
- Success `200`:
  ```
  {
    assignments: Array<{
      id: number;
      subject: string;
      title: string;
      description: string | null;
      dueDate: string;
      createdById: number;
      submittedCount: number;
      totalCount: number;
      hasOverdue: boolean;
    }>
  }
  ```

### `POST /api/assignments`

Requires `requireApiRole(["teacher"])`. Admin always `403`.

Body: `{ classId: number; subject: string; title: string; description?: string; dueDate: string }`.

- `400 { error: "classId, subject, title, and dueDate are required" }` if any required field missing.
- Verifies `ClassTeacher` row for `(classId, teacherUserId: claims.userId)` — `403 { error: "You are not assigned to this class" }` if not.
- Creates the `Assignment` plus one `AssignmentStatus` row (`status: pending`) per student currently in `classId`, in one `$transaction`. Returns `200 { id: number }`.

### `PATCH /api/assignments/:id`

Requires `requireApiRole(["teacher"])`. Admin always `403`.

Body: any subset of `{ subject?: string; title?: string; description?: string; dueDate?: string }`.

- `404 { error: "Assignment not found" }` if the id doesn't exist or doesn't belong to the teacher's school.
- `403 { error: "Only the teacher who created this assignment can edit it" }` if `createdById !== claims.userId`.
- `400 { error: "No fields to update" }` if the body is empty.
- Updates only the provided fields. `classId` is never accepted/updatable. Returns `200 { success: true }`.

### `GET /api/assignments/:id/statuses`

Requires `requireApiRole(["teacher", "admin"])`.

- `404 { error: "Assignment not found" }` if the id doesn't exist.
- Resolves the assignment's `classId`, then applies the same teacher/`ClassTeacher` or admin/`schoolId` scoping as `GET /api/attendance`. `403`/`400` on the same conditions as above.
- Success `200`:
  ```
  {
    statuses: Array<{
      studentId: number;
      name: string;
      status: "pending" | "submitted" | "overdue";
    }>
  }
  ```
  `status` is `"overdue"` only when the stored value is `pending` and `dueDate` is in the past; otherwise the stored value is returned as-is.

### `POST /api/assignments/:id/statuses`

Requires `requireApiRole(["teacher"])`. Admin always `403`.

Body: `{ entries: Array<{ studentId: number; status: "pending" | "submitted" }> }`.

- `404 { error: "Assignment not found" }` if the id doesn't exist.
- `400 { error: "entries are required" }` if missing/empty.
- Verifies `ClassTeacher` row for the assignment's class — `403 { error: "You are not assigned to this class" }` if not. (Any teacher assigned to the class can update statuses — this is a roster action like Attendance, not an authorship action like edit.)
- Verifies every `studentId` belongs to the assignment's class (count check, same pattern as Attendance) — `400 { error: "One or more students do not belong to this class" }` if not.
- `"overdue"` is rejected as an input value — `400 { error: "status must be pending or submitted" }` if any entry sends it.
- Upserts each entry's `AssignmentStatus` row in one `$transaction`. Returns `200 { success: true }`.

## 5. Testing

Following the established Vitest + real-seeded-data + `vi.hoisted` cookie-mocking pattern:

- `GET /api/assignments`: teacher's own class, teacher not assigned (`403`), admin any class in school, cross-school `classId` (`400`), missing `classId` (`400`), submission counts correct.
- `POST /api/assignments`: creates `Assignment` + one `AssignmentStatus` per current class student (verified via direct Prisma query), missing-field `400`s, teacher not assigned to class (`403`), admin attempting to `POST` (`403`).
- `PATCH /api/assignments/:id`: creator can edit, a different teacher assigned to the same class gets `403`, nonexistent/cross-school id gets `404`, empty body gets `400`, `classId` in body is ignored/rejected.
- `GET /api/assignments/:id/statuses`: correct roster, overdue computed correctly for a past-due pending row, not-yet-due pending row stays `"pending"`, teacher/admin scoping matches Attendance's tests.
- `POST /api/assignments/:id/statuses`: upsert correctness (re-save updates, doesn't duplicate), student not in class → `400` all-or-nothing, `"overdue"` submitted as input → `400`, teacher not assigned → `403`, admin `POST` → `403`.
