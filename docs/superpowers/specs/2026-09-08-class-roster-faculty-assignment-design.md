# Class roster + standalone Faculty Assignment module

## Problem

The request was "clicking a Grade should list its students." Investigation showed
this app scopes every roster-adjacent feature (Attendance, Assignments,
TimetableEntry, ClassTeacher, Enrollment) by `classId`, never `gradeId` — Grade
is purely an organizational grouping used for grade-wide things like Subjects
and Promotion. A combined cross-section student list at the Grade level would
be the only feature in the app working that way.

`/dashboard/classes/[id]` already exists and is the natural fit for a roster —
it just currently shows Faculty Assignment (assigning teachers to subjects for
that class) instead. Faculty Assignment is an admin-configuration task, not a
roster view, and deserves its own home.

## Goal

- Clicking a Class (e.g. "Grade 1 A") in the Classes module shows that class's
  student roster.
- Faculty Assignment moves to its own module, under School Management, with
  the same list-then-detail pattern already used for Grades/Subjects: browse
  all Classes → click one → assign faculty.
- No Grade-level student aggregation is built.

## Nav change (`apps/web/src/lib/dashboard/nav-items.ts`)

Add one new top-level leaf to the "School Management" section, alongside
Academic Years / Promotion / Academic Calendar:

```ts
{ href: "/dashboard/faculty-assignment", label: "Faculty Assignment", icon: "UserCog", roles: ["admin"] }
```

`"UserCog"` is a new entry in the `IconName` union (imported from `lucide-react`
and added to `Sidebar.tsx`'s `ICON_MAP`, matching every other icon there).

## Route tree

- `/dashboard/faculty-assignment` (new) — lists all Classes as cards (Grade +
  Section, academic year, enrollment count), browse-only: no create/edit/
  delete, no kebab menu. New component `FacultyAssignmentClassesView`,
  structurally identical to `SubjectsView` (search + grid/list toggle +
  pagination, `EntityCard` per class linking onward). Data: `listClasses`
  (unfiltered, existing function, no changes).
- `/dashboard/faculty-assignment/[classId]` (new) — the exact content that
  used to live at `/dashboard/classes/[id]`: fetches the class, its grade's
  subjects (`listSubjects`), current faculty assignments
  (`listClassFaculty`), and active teachers (`listStaff`, filtered to
  `role: "teacher", status: "active"`), then renders the existing
  `FacultyAssignmentView` component unchanged. Adds a "← Faculty Assignment"
  back link (the old page had none, matching the pattern already used for
  Subjects' grade/subject detail pages).
- `/dashboard/classes/[id]` (content replaced, URL unchanged) — fetches the
  class and its enrolled students (`listStudents` with the new `classId`
  filter, see below), renders the existing `StudentsView` component scoped
  to just this one class. `ClassesView`'s class card keeps its existing
  `href={`/dashboard/classes/${klass.id}`}` — no change needed there, since
  the URL doesn't move, only what it renders.

## Lib change: `listStudents` gains a `classId` filter

`apps/web/src/lib/school-setup/students.ts` — extend the existing `options`
parameter (currently `{ page?, pageSize? }`) with `classId?: number`. When
set, adds `enrollments: { some: { academicYearId: activeYear?.id ?? -1,
classId: options.classId } }` to the `where` clause, mirroring the existing
`listSubjects(prisma, { gradeId, schoolId })` filter shape and the
`activeYear ? ... : { id: -1 }` no-active-year fallback already used inside
this same function for the `include` clause.

## Component change: `StudentsView` gains `hideClassFilter`

`apps/web/src/components/school-setup/StudentsView.tsx` — new optional prop
`hideClassFilter?: boolean` (default `false`, so `/dashboard/students`'
existing behavior is untouched). When `true`, the "Filter by class" `<select>`
is not rendered — it's meaningless when the page is already scoped to one
class. The Class Detail Page passes `hideClassFilter` and a single-entry
`classes` array (`[{ id, gradeName, section }]` for that one class), which
the `StudentDetailModal`'s class picker still needs for its own edit/reassign
UI.

## Removed / superseded

Nothing is deleted at the route level — `/dashboard/classes/[id]/page.tsx`'s
*content* is replaced (Faculty Assignment → Roster), and its old content
moves to the new `/dashboard/faculty-assignment/[classId]/page.tsx` file.

## Testing

- `students-lib.test.ts`: new DB-integration test(s) for `listStudents`'s
  `classId` filter — two classes under the same grade, students in each,
  assert the filtered call returns only the targeted class's students.
- `students-view.test.tsx`: new test asserting the "Filter by class" select
  is absent when `hideClassFilter` is passed, and present (current behavior)
  when it isn't.
- New `faculty-assignment-classes-view.test.tsx` for the new picker
  component, mirroring `subjects-view.test.tsx`'s structure (card links,
  search, list view, empty state).
- `nav-items.test.ts`: existing href-existence check self-validates the two
  new routes; no per-item assertions reference the old Faculty Assignment
  location.
- No test file for `FacultyAssignmentView` exists today, and none is added —
  the component itself is unchanged, only its page wrapper moves.
