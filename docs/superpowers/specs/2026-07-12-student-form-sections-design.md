# Student Form: 3-Section Redesign

## Goal
Reorganize the Add/Edit Student form (`StudentDetailModal.tsx`) into three headed sections — Student Details, Sibling Details, Parent Details — with the full field set requested, adding the underlying data model where it doesn't yet exist.

## Current state
- Single flat form: Name, DOB, Admission No, Roll Number, Photo, Class (name+section combined), and a single Parent name+phone (create-mode only, plain `useState`, no schema/form library).
- `Student` model: `name`, `dob`, `admissionNo` (unique), `status` (enum, button-driven), `photoUrl`. No `gender`, no separate ID number, no join date.
- Parents are `User` records (role=parent) linked via `ParentStudent` (many-to-many, no relationship label). No `email` on `User`.
- `Class` already has separate `name` and `section` columns — "Division" is just `section` relabeled, no schema change.
- No sibling concept anywhere in the schema.

## Data model changes (new Prisma migration)

```prisma
enum Gender {
  male
  female
}

model Student {
  // ...existing fields
  gender          Gender?
  studentIdNumber String?  @unique
  dateOfJoin      DateTime?

  siblingLinks    StudentSibling[] @relation("StudentSiblingA")
  siblingOfLinks  StudentSibling[] @relation("StudentSiblingB")
}

model StudentSibling {
  id        Int     @id @default(autoincrement())
  student   Student @relation("StudentSiblingA", fields: [studentId], references: [id])
  studentId Int
  sibling   Student @relation("StudentSiblingB", fields: [siblingId], references: [id])
  siblingId Int

  @@unique([studentId, siblingId])
}

model User {
  // ...existing fields
  email String?
}

model ParentStudent {
  // ...existing fields
  relationship String @default("Guardian")
}
```

Notes:
- `gender`, `studentIdNumber`, `dateOfJoin` are nullable — existing students have none of these until edited.
- `studentIdNumber` is globally unique (matches the existing `admissionNo` pattern). Nullable unique columns allow multiple NULLs in Postgres, so existing rows are unaffected.
- Sibling links are queried symmetrically: a student's siblings = all `StudentSibling` rows where `studentId = X OR siblingId = X`, resolving to "the other side" of each row. Linking from either student's form makes the pair visible from both.
- `relationship` defaults to `"Guardian"` for existing `ParentStudent` rows (backfill-safe).

## Name handling (UI-only split, no schema change)
First Name / Last Name inputs are UI-only for both Student and each Parent:
- **Save**: `name = \`${firstName} ${lastName}\`.trim()` — written to the existing single `name` column.
- **Edit (prefill)**: split `name` on the first space — everything before is First Name, everything after is Last Name.

This is a lossy heuristic for multi-word last names (e.g. "Mary Anne Smith" → first="Mary", last="Anne Smith") but avoids touching `name` storage across the rest of the app (teachers, admins, reports all still read a single `name`).

## Status field
`Status` is displayed as a **read-only field** in Student Details, not an editable dropdown. Changing status stays driven by the existing Activate/Deactivate buttons, which also update the active `Enrollment.status` in the same transaction — a raw dropdown would let the two fall out of sync.

## Sibling section (repeatable rows)
Each row: a search/select control over the school's existing student list (already available to `StudentsView`/passed into the modal), keyed by name + admission no. Once a student is selected, First Name, Last Name, Admission No, Gender, Class, Division are auto-filled **read-only** from that real record (no manual entry, no drift).
- Rows addable/removable.
- Self-reference (selecting the student being edited) is rejected client-side and server-side.
- On save: reconcile `StudentSibling` rows for the edited student against the selected set (create new links, remove unselected ones that were previously present).

## Parent section (repeatable rows)
Each row: Relationship (select: Father / Mother / Guardian / Other), First Name, Last Name, Email, Mobile Number.
- Backed by `ParentStudent` (+ new `relationship`) and `User` (+ new `email`), reusing the existing find-by-phone-or-create logic in `createStudent`.
- At least one parent row required on create (matches current behavior requiring `parentPhone`).
- Editing an existing parent row's name/email updates the shared `User` record (same phone) — note this affects that parent's login profile.

## Form layout
`StudentDetailModal.tsx` restructured into three sections using a new small `FormSection` component (heading + divider, no existing equivalent in the codebase):
1. **Student Details** — First Name, Last Name, Admission No, DOB, Class, Division (=`section`), Date of Join, ID (`studentIdNumber`), Gender, Status (read-only).
2. **Sibling Details** — repeatable rows as above.
3. **Parent Details** — repeatable rows as above.

## Backend changes
`apps/web/src/lib/school-setup/students.ts`:
- `createStudent` / `editStudent` input types extended with `gender?`, `studentIdNumber?`, `dateOfJoin?`, `siblingStudentIds?: number[]`, `parents: { relationship, firstName, lastName, phone, email? }[]` (replacing the single `parentName`/`parentPhone`).
- New validation: duplicate `studentIdNumber` (`DUPLICATE_STUDENT_ID`), sibling self-reference (`INVALID_SIBLING`), at-least-one-parent-on-create (`PARENT_REQUIRED`).
- Transaction extended to upsert `StudentSibling` rows and multiple `ParentStudent`/`User` rows.

API routes (`api/students/route.ts`, `api/students/[id]/route.ts`): parse/pass the new fields and array shapes; map new error codes to HTTP responses (409/400 as appropriate, consistent with existing pattern).

## Out of scope
- Making `Status` a freely-editable dropdown (kept button-driven, see above).
- Migrating `name` to real `firstName`/`lastName` columns (UI-only split per decision above).
- Sibling free-text entry (link-to-existing-student only, per decision above).
