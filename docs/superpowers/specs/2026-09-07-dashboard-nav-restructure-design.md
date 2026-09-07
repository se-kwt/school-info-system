# Dashboard Navigation Restructure — Design

## Context

The staff/admin dashboard sidebar is currently a flat, single-level list of 13 routes, defined in `apps/web/src/lib/dashboard/nav-items.ts` and rendered by `apps/web/src/components/dashboard/Sidebar.tsx`. The user supplied a much larger, two-level target menu (19 top-level entries, several with sub-items) and we worked through it issue-by-issue to arrive at a corrected version. This doc captures that corrected structure and the decisions behind it, as the basis for an implementation plan.

**Non-goal:** the parent portal (`apps/web/src/app/parent/**`) is explicitly out of scope — it keeps its own separate, simplified navigation, untouched by this work. New modules floated during review (Staff Leave Management, Payroll, Library, Transport) were explicitly declined for this round.

## Final Navigation Structure

```
Main Menu
  Dashboard                                  /dashboard                              [existing]

Academic
  Grades          → All Grades               /dashboard/grades                       [existing]
                  → Add Grade                /dashboard/grades/add                   [new page]
  Classes         → All Classes              /dashboard/classes                      [existing]
                  → Add Class                /dashboard/classes/add                  [new page]
  Subjects        → All Subjects             /dashboard/subjects                     [stub]
                  → Add Subject              /dashboard/subjects/add                 [stub]
  Syllabus        → All Syllabus             /dashboard/syllabus                     [stub]
                  → Add Syllabus             /dashboard/syllabus/add                 [stub]
  Periods         → Period Management        /dashboard/periods                      [existing]
  Timetable       → Class Timetable          /dashboard/timetable                    [existing]
                  → Teacher Timetable        /dashboard/timetable/teacher            [stub]

People
  Students        → All Students             /dashboard/students                     [existing]
                  → Add Student              /dashboard/students/add                 [new page]
                  → Student Admission        /dashboard/students/admission           [stub]
                  → Change Grade/Class       /dashboard/students/change-class        [stub]
                  → Student Transfer         /dashboard/students/transfer            [stub]
  Staff           → All Staff                /dashboard/staff                        [existing]
                  → Add Staff                /dashboard/staff/add                    [new page]
                  → Departments              /dashboard/staff/departments            [stub]
                  → Designations             /dashboard/staff/designations           [stub]

Progress
  Attendance      → Student Attendance       /dashboard/attendance                   [existing]
                  → Staff Attendance         /dashboard/attendance/staff             [stub]
  Assignments     → All Assignments          /dashboard/assignments                  [existing]
                  → Create Assignment        /dashboard/assignments (same page)      [existing]
  Exams & Marks   → Exams                    /dashboard/marks (same page)            [existing]
                  → Marks                    /dashboard/marks                        [existing]
                  → Grade Book               /dashboard/marks/gradebook              [stub]
                  → Report Cards             /dashboard/marks/report-cards           [stub]

Finance
  Fees            → Fee Structure            /dashboard/fees (same page)             [existing]
                  → Fee Collection           /dashboard/fees                         [existing]
                  → Payments                 /dashboard/fees/payments                [stub]
                  → Outstanding Fees         /dashboard/fees/outstanding             [stub]

School Management
  Academic Years  → All Academic Years       /dashboard/academic-years               [existing]
                  → Add Academic Year        /dashboard/academic-years (same page)   [existing]
  Promotion       → Promote Students         /dashboard/academic-years/promote       [existing]
                  → Promotion History        /dashboard/academic-years/promote/history [stub]
  Academic Calendar                          /dashboard/academic-calendar            [stub]

Communication
  Notifications   → Announcements            /dashboard/notifications/announcements  [stub]
                  → In-App Notifications     /dashboard/notifications                [existing]
                  → Events                   /dashboard/notifications/events         [stub]

Reports
  Reports         → Student Reports          /dashboard/reports/students             [stub]
                  → Academic Reports         /dashboard/reports/academic             [stub]
                  → Attendance Reports       /dashboard/reports/attendance           [stub]
                  → Staff Reports            /dashboard/reports/staff                [stub]
                  → Fee Reports              /dashboard/reports/fees                 [stub]

Workspace
  Settings        → School Settings          /dashboard/settings                     [existing]
                  → Users & Roles            /dashboard/settings/users               [stub]
                  → Permissions              /dashboard/settings/permissions         [stub]
                  → System Settings          /dashboard/settings/system              [stub]
```

`[existing]` = already built, no route change. `[new page]` = built today as a modal; this restructure extracts it into its own page. `[stub]` = not built yet; gets a minimal placeholder page so the menu link isn't dead (see Global Constraints in the implementation plan for what a stub page looks like).

## Decision Log

Each numbered issue was raised, discussed, and resolved individually:

1. **"Grades" naming collision** with "Exams & Marks" (today's `/dashboard/grades` is grade-level master data, not student marks) — **resolved: keep the label "Grades"** as-is; revisit later if it proves confusing in practice.
2. **"Promotion" appeared twice** (under `Students` and under `School Management`) — **resolved: keep both**, but disambiguate. `Students > Student Promotion` is renamed to **`Change Grade/Class`** (a single-student, ad-hoc reassignment), while `School Management > Promotion` (Promote Students / Promotion History) remains the standard bulk, end-of-year promotion workflow. This split matches conventional SIS terminology, where "Promotion" is reserved for the bulk process.
3. **`Attendance Reports` and `Fee Reports` each appeared twice** (once under their own domain, once under the top-level `Reports` group) — **resolved: keep them only under the top-level `Reports` group**; removed from `Attendance` and `Fees`.
4. **Two top-level groups both read as "Academic"** (`Academic` and `Academics & Assessment`) — **resolved: rename `Academics & Assessment` to `Progress`** (covers Attendance, Assignments, and Exams & Marks as different signals of a student's progress). `Academic` is unchanged.
5. **Missing common modules** (Staff Leave Management, Payroll, Library, Transport) — **resolved: none added**, out of scope for this round.
6. **No parent/student-facing nav** in this tree — **resolved: confirmed out of scope**; the parent portal keeps its own separate navigation.
7. **Icon reuse** across unrelated top-level items — **resolved: every top-level item gets a unique icon** (table below). Sub-items (the indented `└─` rows) don't carry their own icons, matching the original mockup.

**Cross-cutting decision:** `Add Grade`, `Add Class`, `Add Subject`, `Add Student`, and `Add Staff` move from popup modals to dedicated pages. This applies specifically to the five items that exist today as a list-page-plus-modal (`GradesView`, `ClassesView`, `StudentsView`, `StaffView`) or will be built that way (`Subjects`). It does **not** apply to `Add Academic Year` or `Create Assignment` — those are already inline forms on their existing pages, not popups, so there's nothing to convert.

## Role Visibility

Existing routes keep their current role gate, unchanged (verified against each page's live `requireDashboardRole(...)` call):

| Route | Roles |
|---|---|
| `/dashboard` | teacher, admin, accountant |
| `/dashboard/grades` | admin |
| `/dashboard/classes` | admin |
| `/dashboard/staff` | admin |
| `/dashboard/students` | teacher, admin |
| `/dashboard/attendance` | teacher, admin |
| `/dashboard/assignments` | teacher, admin |
| `/dashboard/marks` | teacher, admin |
| `/dashboard/periods` | admin |
| `/dashboard/timetable` | teacher, admin |
| `/dashboard/fees` | admin, accountant |
| `/dashboard/academic-years` | admin |
| `/dashboard/academic-years/promote` | admin |
| `/dashboard/notifications` | teacher, admin, accountant |
| `/dashboard/settings` | teacher, admin, accountant |

New "Add" pages inherit their list page's role gate (e.g. `/dashboard/grades/add` → admin, `/dashboard/students/add` → teacher, admin). All other new stub routes default to **admin only**, except the two new Fees stubs (`Payments`, `Outstanding Fees`), which get **admin, accountant** to match `/dashboard/fees`.

## Icon Assignment (unique per top-level item)

| Item | Icon (lucide-react) |
|---|---|
| Dashboard | `LayoutDashboard` |
| Grades | `Layers` |
| Classes | `Building2` |
| Subjects | `BookMarked` |
| Syllabus | `ScrollText` |
| Periods | `Clock` |
| Timetable | `CalendarClock` |
| Students | `GraduationCap` |
| Staff | `Users` |
| Attendance | `ClipboardCheck` |
| Assignments | `BookOpen` |
| Exams & Marks | `Award` |
| Fees | `Wallet` |
| Academic Years | `CalendarRange` |
| Promotion | `TrendingUp` |
| Academic Calendar | `CalendarDays` |
| Notifications | `Bell` |
| Reports | `FileBarChart` |
| Settings | `Settings` |

No icon repeats across the list.

## "Add X" Modal → Dedicated Page Pattern

For `Grades`, `Classes`, `Students`, and `Staff`, the current pattern is: one list page (`GradesView`, `ClassesView`, `StudentsView`, `StaffView`) that opens a `Modal` component in "create" mode for adding a new record, submitting to the same API the list page already uses. The restructure extracts each "create" form out of its modal into its own route (`/dashboard/grades/add`, etc.), which:

- Renders the same form fields, in a page instead of a modal.
- Submits to the same existing API endpoint the modal already posts to.
- Redirects back to the list page (e.g. `/dashboard/grades`) on success.
- Keeps the **edit** flow as a modal on the list page, unchanged — only **create** moves to its own page. (Edit wasn't part of the user's request; changing it isn't in scope.)

`Subjects` and `Staff`'s `Add Staff` follow the same shape once built/extracted. `Add Academic Year` and `Create Assignment` are unaffected (see Decision Log, cross-cutting decision).

## Out of Scope

- Parent/student portal navigation.
- New modules: Staff Leave Management, Payroll, Library, Transport.
- Reconciling the new top-level `Subjects`/`Syllabus` stubs with the existing nested subject management under `Grades > [grade] > Subjects` (`grades/[id]/subjects/[subjectId]`) — both can coexist until the new top-level module is actually built out.
- The "Division" vs "Section" naming question — parked, not resolved in this round.

## Testing / Verification Approach

(Detailed in the implementation plan.) In short: a data-model unit test that every href in the nav tree resolves to a real `page.tsx` on disk (catches dead links), role-filtering unit tests per role, and Testing-Library coverage for the `Sidebar` component's expand/collapse and active-route behavior. Stub pages themselves follow the existing codebase convention of no per-page test (matching `grades/page.tsx`, `staff/page.tsx`, etc. today), verified instead by typecheck plus the nav tree's filesystem-existence test.
