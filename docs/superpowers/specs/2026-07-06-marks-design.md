# Marks (Exams & Marks) — Design Spec

Status: Approved — 2026-07-06

## 1. Scope and Motivation

Attendance, Assignments, and Timetable are merged — Marks (Exams & Marks) is next on the roadmap. This sub-project covers:

1. Admin creating Exams (name, term, exam date) — school-wide entities, create-only.
2. Teacher entering marks in bulk for one of their own `(class, subject)` pairs, for a chosen exam — one `maxMarks` value applies to the whole batch, `marksObtained` is entered per student, and `grade` is computed server-side (never entered manually).
3. Both Teacher and Admin viewing the full subject-wise marks breakdown for a class+exam — every subject that has marks entered so far, not just one at a time.

**Explicitly out of scope:**
- The parent-facing read API / mobile app — deferred until the mobile app sub-project needs it, same reasoning as Attendance/Assignments' deferred parent APIs.
- Editing or deleting an Exam after creation (create-only, matching the Students/Classes/Staff/Timetable-entry-creation pattern of deferring edit/delete unless explicitly needed).
- Manual grade entry or teacher override of the computed grade.
- Per-student `maxMarks` — it is fixed once per entry batch (class + subject + exam), not configurable per student.

## 2. Architecture

No database schema changes — `Exam` and `Mark` already exist from Foundation.

**Pattern consistency:**
- `src/lib/exams.ts` — an Admin-setup-style module (matching `src/lib/school-setup/classes.ts`/`staff.ts`): `listExams(prisma, schoolId)` and `createExam(prisma, schoolId, input)`. No unique-constraint conflict path exists for `Exam` (no natural uniqueness key on name/term/date), so create either succeeds or fails on missing-field validation only — no `409` case here.
- `src/lib/marks.ts` — following Attendance/Assignments' business-logic-module pattern:
  - `getMarksForClassExam` — the full subject-wise breakdown. Teacher access checked via `ClassTeacher` on the class (any subject); Admin via `schoolId`. Both scoping checks mirror `getAttendanceRoster`/`listAssignments` exactly.
  - `enterMarks` — bulk upsert scoped to one `(classId, subject, teacherUserId)` triple. Verifies a `ClassTeacher` row exists for that exact `(classId, subject, teacherUserId)` combination — `403` if not (a teacher assigned to a class for "Math" cannot enter marks under "Science" for the same class). Verifies every `studentId` in the batch belongs to `classId` — same all-or-nothing `400` check used by Attendance's `markAttendance` and Assignments' `updateAssignmentStatuses`. All upserts happen in one `$transaction`, keyed on the existing `@@unique([examId, studentId, subject])` constraint (Prisma's compound key name: `examId_studentId_subject`).
- **Grade is computed, not display-only.** Unlike Assignments' "overdue" (a derived read-time value never persisted), `grade` is a real, already-existing column on `Mark`. A pure helper `computeGrade(marksObtained: number, maxMarks: number): string` applies the fixed scale (see section 4) and its result is written to the `grade` column at the same time as `marksObtained`/`maxMarks` — computed once per write, not re-derived on every read.
- Two role-conditional views share one Server Component page `/dashboard/marks`: exam selector, class selector (teacher: `getClassesForTeacher`; admin: `listClasses`, both existing helpers), and — for teachers only — a subject selector populated from their own `ClassTeacher` rows for the selected class.

## 3. Screen

**`/dashboard/marks`** (single page, both roles):

1. **Exam selector** — dropdown listing all exams in the school (exams aren't scoped to a class, so both roles see the same list via `listExams`).
2. **Class selector** — dropdown. Teacher: `getClassesForTeacher(prisma, claims.userId)`. Admin: `listClasses(prisma, claims.schoolId)`.
3. **Breakdown table** — always visible, always read-only, for both roles: rows are students in the selected class, columns are every subject with at least one `Mark` row for this class+exam combination. Each cell shows `marksObtained/maxMarks (grade)`; a student/subject combination with no row yet shows "—".
4. **Teacher only: "Enter Marks" panel**, below the table:
   - A subject dropdown populated from the teacher's own `ClassTeacher` rows for the selected class (a teacher who teaches this class for two subjects sees both as options).
   - A single "Max Marks" input applying to the entire batch about to be saved.
   - An editable roster: one `marksObtained` input per student, pre-filled with any existing value for that subject+exam if present.
   - A single "Save Marks" button submits every row in one request, matching the established bulk-save UX from Attendance/Assignments. The grade is computed server-side and reflected in the breakdown table above after save — there is no client-editable grade field anywhere.

## 4. API Contracts

### `GET /api/exams`

Requires `requireApiRole(["teacher", "admin"])`. Both roles see the same school-wide list.

Success `200`: `{ exams: Array<{ id: number; name: string; term: string; examDate: string }> }`, sorted by `examDate` descending.

### `POST /api/exams`

Requires `requireApiRole(["admin"])`. Teacher always `403`.

Body: `{ name: string; term: string; examDate: string }`.

- `400 { error: "name, term, and examDate are required" }` if any field is missing.
- Success `200 { id: number }`.

### `GET /api/marks`

Query params: `classId` (number), `examId` (number).

Requires `requireApiRole(["teacher", "admin"])`.

- Teacher: verifies a `ClassTeacher` row exists for `(classId, teacherUserId: claims.userId)` — any subject. `403 { error: "You are not assigned to this class" }` if not.
- Admin: verifies the class exists and belongs to `claims.schoolId`. `400 { error: "The selected class does not exist" }` if not.
- `400 { error: "The selected exam does not exist" }` if `examId` doesn't belong to `claims.schoolId`.
- `400 { error: "classId and examId are required" }` if either is missing/non-numeric.
- Success `200`:
  ```
  {
    subjects: string[];
    students: Array<{
      studentId: number;
      name: string;
      marks: Record<string, { marksObtained: number; maxMarks: number; grade: string } | null>;
    }>
  }
  ```
  `subjects` lists every subject with at least one `Mark` row for this class+exam, derived from the actual data (not from `ClassTeacher`, since a class can have marks entered under a subject even if the original teacher has since changed). Each student's `marks` record has one key per subject in `subjects`, `null` if that student has no row for that subject.

### `POST /api/marks`

Requires `requireApiRole(["teacher"])`. Admin always `403`.

Body: `{ classId: number; examId: number; subject: string; maxMarks: number; entries: Array<{ studentId: number; marksObtained: number }> }`.

- `400 { error: "classId, examId, subject, maxMarks, and entries are required" }` if any top-level field is missing or `entries` is empty.
- `400 { error: "The selected exam does not exist" }` if `examId` doesn't belong to the teacher's school.
- Verifies a `ClassTeacher` row exists for `(classId, subject, teacherUserId: claims.userId)` — `403 { error: "You are not assigned to this class and subject" }` if not.
- Verifies every `studentId` in `entries` belongs to `classId` (count check) — `400 { error: "One or more students do not belong to this class" }` if not, all-or-nothing (no partial write).
- `400 { error: "maxMarks must be greater than 0" }` if `maxMarks` is zero or negative (guards `computeGrade`'s division from a divide-by-zero).
- `400 { error: "marksObtained must be between 0 and maxMarks" }` if any entry's `marksObtained` is negative or exceeds `maxMarks`.
- On success: computes `grade` per entry via `computeGrade`, upserts each `Mark` row (`examId_studentId_subject` compound key) with `marksObtained`, `maxMarks`, `grade`, all in one `$transaction`. Returns `200 { success: true }`.

**Grade scale** (fixed, applied by `computeGrade`): percentage = `marksObtained / maxMarks × 100`.
- `≥ 90` → `"A"`
- `≥ 75` → `"B"`
- `≥ 60` → `"C"`
- `≥ 40` → `"D"`
- `< 40` → `"F"`

## 5. Testing

Following the established Vitest + real-seeded-data + `vi.hoisted` cookie-mocking pattern:

- `GET /api/exams` / `POST /api/exams`: admin creates and lists, missing-field `400`, teacher `POST` → `403`.
- `GET /api/marks`: teacher's own class (any subject taught there), teacher not assigned → `403`, admin any class in school, cross-school `classId`/`examId` → `400`, missing params → `400`, a student/subject with no row returns `null` in `marks`, `subjects` list reflects only subjects with actual data.
- `POST /api/marks`: fresh entry creates the expected `Mark` rows with computed grade (verified via direct Prisma query), re-save (upsert) updates without duplicating (still one row per student per subject per exam), a `studentId` outside `classId` → `400` all-or-nothing (no rows created for the valid students either), teacher not assigned to that `(classId, subject)` → `403`, admin `POST` → `403`, `maxMarks` zero or negative → `400`, `marksObtained` negative or `> maxMarks` → `400`, grade boundary tests at each threshold (89 vs 90, 74 vs 75, 59 vs 60, 39 vs 40 out of 100 → correct letter on each side).
