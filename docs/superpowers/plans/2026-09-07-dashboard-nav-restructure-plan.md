# Dashboard Navigation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the corrected 9-section dashboard nav from `docs/superpowers/specs/2026-09-07-dashboard-nav-restructure-design.md`: a nested `nav-items.ts` tree + `Sidebar.tsx` rewrite, 27 "Coming soon" stub pages so no menu link is dead, and extraction of the Grade/Class/Staff/Student "create" flows from popup modals into dedicated `/add` pages.

**Architecture:** `nav-items.ts` exposes `getNavSectionsForRole(role): NavSection[]`. A `NavSection` holds `NavEntry[]`; an entry is either a `NavTopLeaf` (has its own icon — only `Dashboard` and `Academic Calendar` in this tree) or a `NavGroup` (icon on the group header; `children: NavChildLeaf[]` with **no icon** — matching the source mockup where only top-level rows carry an icon and `└─` sub-rows are plain indented text). `Sidebar.tsx` renders top-leaves as normal links, groups as collapsible disclosure buttons, and — only when the whole sidebar is collapsed to its icon rail — flattens each group's children into icon rows reusing the *parent group's* icon (children have none of their own).

For the four modal→page conversions: `GradesView`/`ClassesView` have their "create" fields inlined directly in the view file (no separate modal component), so create-mode is removed from those files entirely and rebuilt as a small standalone page. `StaffDetailModal`/`StudentDetailModal` are already separate, reusable components that only need one new `variant?: "modal" | "page"` prop (default `"modal"`, so all existing tests keep passing untouched) — the new `/add` pages render them with `variant="page"` and no `<Modal>` chrome around them.

**Tech Stack:** Next.js App Router, React Client Components, lucide-react icons, Vitest + Testing Library.

## Global Constraints

- Every existing page keeps its current `requireDashboardRole([...])` gate, verified against live code (table in the spec's Role Visibility section).
- All 27 new stub leaves render the shared `ComingSoonPage` component, gated `["admin"]` except the two Fees stubs (`Payments`, `Outstanding Fees`), gated `["admin", "accountant"]` to match `/dashboard/fees`.
- No new npm dependencies. lucide-react icons used (all present at the installed `^0.400.0`): `LayoutDashboard, Layers, Building2, BookMarked, ScrollText, Clock, CalendarClock, GraduationCap, Users, ClipboardCheck, BookOpen, Award, Wallet, CalendarRange, TrendingUp, CalendarDays, Bell, FileBarChart, Settings, ChevronLeft, ChevronRight, ChevronDown`.
- Several nav leaves intentionally **share an href** with a sibling in the same group (`Exams`/`Marks` → `/dashboard/marks`; `Fee Structure`/`Fee Collection` → `/dashboard/fees`; `All Academic Years`/`Add Academic Year` → `/dashboard/academic-years`; `All Assignments`/`Create Assignment` → `/dashboard/assignments`) because that page already handles both concerns inline. This is intentional, not a bug — do not add a "no duplicate href" test.
- Stub pages follow the existing codebase convention of no per-page test (`grades/page.tsx`, `staff/page.tsx`, etc. have none today); verified instead by `tsc --noEmit` plus `nav-items.test.ts`'s filesystem-existence check.
- Run tests/typecheck from `apps/web`: `npx vitest run <file>`, `npx tsc --noEmit`.

## File Structure

- `apps/web/src/components/dashboard/ComingSoonPage.tsx` — new shared placeholder.
- `apps/web/src/lib/dashboard/nav-items.ts` — full rewrite (nested tree, no child icons).
- `apps/web/src/components/dashboard/Sidebar.tsx` — full rewrite.
- `apps/web/src/app/dashboard/layout.tsx` — wire `getNavSectionsForRole`.
- 27 new stub `page.tsx` files (Tasks 2–9 below).
- `apps/web/src/components/school-setup/GradesView.tsx` — remove create mode.
- `apps/web/src/components/school-setup/ClassesView.tsx` — remove create mode.
- `apps/web/src/components/school-setup/StaffDetailModal.tsx` — add `variant` prop.
- `apps/web/src/components/school-setup/StaffView.tsx` — "Add new staff" becomes a link.
- `apps/web/src/components/school-setup/StudentDetailModal.tsx` — add `variant` prop.
- `apps/web/src/components/school-setup/StudentsView.tsx` — "Add new student" becomes a link.
- `apps/web/src/app/dashboard/grades/add/page.tsx`, `apps/web/src/app/dashboard/classes/add/page.tsx`, `apps/web/src/app/dashboard/staff/add/page.tsx`, `apps/web/src/app/dashboard/students/add/page.tsx` — new.
- New test files: `coming-soon-page.test.tsx`, `nav-items.test.ts` (rewrite), `sidebar.test.tsx` (rewrite), `add-grade-page.test.tsx`, `add-class-page.test.tsx`, `add-staff-page.test.tsx`, `add-student-page.test.tsx`.

## Final Navigation Tree (reference — full rationale in the spec)

```
Main Menu:        Dashboard
Academic:         Grades{All,Add} · Classes{All,Add} · Subjects{All,Add} · Syllabus{All,Add} ·
                   Periods{Period Management} · Timetable{Class,Teacher}
People:           Students{All,Add,Admission,Change Grade/Class,Transfer} ·
                   Staff{All,Add,Departments,Designations}
Progress:         Attendance{Student,Staff} · Assignments{All,Create} ·
                   Exams & Marks{Exams,Marks,Grade Book,Report Cards}
Finance:          Fees{Structure,Collection,Payments,Outstanding}
School Management: Academic Years{All,Add} · Promotion{Promote,History} · Academic Calendar
Communication:    Notifications{Announcements,In-App,Events}
Reports:          Reports{Student,Academic,Attendance,Staff,Fee}
Workspace:        Settings{School,Users & Roles,Permissions,System}
```

---

### Task 1: Shared `ComingSoonPage` component

**Files:**
- Create: `apps/web/src/components/dashboard/ComingSoonPage.tsx`
- Test: `apps/web/tests/coming-soon-page.test.tsx`

**Interfaces:**
- Produces: `ComingSoonPage({ title, description }: { title: string; description: string })`, used by every stub page in Tasks 2–9.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/coming-soon-page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComingSoonPage } from "../src/components/dashboard/ComingSoonPage";

describe("ComingSoonPage", () => {
  it("renders the given title and description with a coming-soon badge", () => {
    render(<ComingSoonPage title="Subjects" description="A dedicated subjects catalog is coming soon." />);
    expect(screen.getByRole("heading", { name: "Subjects" })).toBeInTheDocument();
    expect(screen.getByText("A dedicated subjects catalog is coming soon.")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/coming-soon-page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/components/dashboard/ComingSoonPage.tsx
export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <h1 className="mb-2 text-sm font-bold text-neutral-800">{title}</h1>
      <p className="text-xs text-neutral-400">{description}</p>
      <p className="mt-4 inline-block rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
        Coming soon
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/coming-soon-page.test.tsx` → PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/ComingSoonPage.tsx apps/web/tests/coming-soon-page.test.tsx
git commit -m "feat(nav): add shared ComingSoonPage placeholder component"
```

---

### Task 2: Academic stub pages

**Files:**
- Create: `apps/web/src/app/dashboard/subjects/page.tsx`
- Create: `apps/web/src/app/dashboard/subjects/add/page.tsx`
- Create: `apps/web/src/app/dashboard/syllabus/page.tsx`
- Create: `apps/web/src/app/dashboard/syllabus/add/page.tsx`
- Create: `apps/web/src/app/dashboard/timetable/teacher/page.tsx`

- [ ] **Step 1: Create the five pages**

```tsx
// apps/web/src/app/dashboard/subjects/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function SubjectsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Subjects"
      description="A dedicated, school-wide subjects catalog is planned; subjects are currently managed from within each grade."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/subjects/add/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AddSubjectPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Add Subject"
      description="Creating subjects from a school-wide catalog is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/syllabus/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function SyllabusPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Syllabus"
      description="Syllabus planning and version tracking across subjects is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/syllabus/add/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AddSyllabusPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Add Syllabus"
      description="Creating a new syllabus entry is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/timetable/teacher/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function TeacherTimetablePage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Teacher Timetable"
      description="A per-teacher weekly schedule view, across all their classes, is coming soon."
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — no errors referencing these five files.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/subjects apps/web/src/app/dashboard/syllabus apps/web/src/app/dashboard/timetable/teacher
git commit -m "feat(nav): add Academic stub pages (Subjects, Syllabus, Teacher Timetable)"
```

---

### Task 3: People stub pages

**Files:**
- Create: `apps/web/src/app/dashboard/students/admission/page.tsx`
- Create: `apps/web/src/app/dashboard/students/change-class/page.tsx`
- Create: `apps/web/src/app/dashboard/students/transfer/page.tsx`
- Create: `apps/web/src/app/dashboard/staff/departments/page.tsx`
- Create: `apps/web/src/app/dashboard/staff/designations/page.tsx`

- [ ] **Step 1: Create the five pages**

```tsx
// apps/web/src/app/dashboard/students/admission/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StudentAdmissionPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Student Admission"
      description="A guided, multi-step admission workflow for new students is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/students/change-class/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function ChangeGradeClassPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Change Grade/Class"
      description="Moving a single student to a different grade or class mid-year is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/students/transfer/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StudentTransferPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Student Transfer"
      description="Transferring a student out to, or in from, another school is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/staff/departments/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function DepartmentsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Departments" description="Organizing staff into departments is coming soon." />
  );
}
```

```tsx
// apps/web/src/app/dashboard/staff/designations/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function DesignationsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Designations" description="Managing staff job titles and designations is coming soon." />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — no errors referencing these five files.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/students/admission apps/web/src/app/dashboard/students/change-class apps/web/src/app/dashboard/students/transfer apps/web/src/app/dashboard/staff/departments apps/web/src/app/dashboard/staff/designations
git commit -m "feat(nav): add People stub pages (Admission, Change Grade/Class, Transfer, Departments, Designations)"
```

---

### Task 4: Progress stub pages

**Files:**
- Create: `apps/web/src/app/dashboard/attendance/staff/page.tsx`
- Create: `apps/web/src/app/dashboard/marks/gradebook/page.tsx`
- Create: `apps/web/src/app/dashboard/marks/report-cards/page.tsx`

- [ ] **Step 1: Create the three pages**

```tsx
// apps/web/src/app/dashboard/attendance/staff/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StaffAttendancePage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Staff Attendance" description="Daily attendance tracking for staff is coming soon." />
  );
}
```

```tsx
// apps/web/src/app/dashboard/marks/gradebook/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function GradeBookPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Grade Book"
      description="A consolidated, spreadsheet-style grade book across exams and subjects is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/marks/report-cards/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function ReportCardsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Report Cards" description="Generating printable student report cards is coming soon." />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — no errors referencing these three files.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/attendance/staff apps/web/src/app/dashboard/marks/gradebook apps/web/src/app/dashboard/marks/report-cards
git commit -m "feat(nav): add Progress stub pages (Staff Attendance, Grade Book, Report Cards)"
```

---

### Task 5: Finance stub pages

**Files:**
- Create: `apps/web/src/app/dashboard/fees/payments/page.tsx`
- Create: `apps/web/src/app/dashboard/fees/outstanding/page.tsx`

- [ ] **Step 1: Create the two pages**

```tsx
// apps/web/src/app/dashboard/fees/payments/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function PaymentsPage() {
  await requireDashboardRole(["admin", "accountant"]);
  return (
    <ComingSoonPage title="Payments" description="A unified log of individual fee payment transactions is coming soon." />
  );
}
```

```tsx
// apps/web/src/app/dashboard/fees/outstanding/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function OutstandingFeesPage() {
  await requireDashboardRole(["admin", "accountant"]);
  return (
    <ComingSoonPage
      title="Outstanding Fees"
      description="A roster of students with pending or overdue fee balances is coming soon."
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — no errors referencing these two files.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/fees/payments apps/web/src/app/dashboard/fees/outstanding
git commit -m "feat(nav): add Finance stub pages (Payments, Outstanding Fees)"
```

---

### Task 6: School Management stub pages

**Files:**
- Create: `apps/web/src/app/dashboard/academic-years/promote/history/page.tsx`
- Create: `apps/web/src/app/dashboard/academic-calendar/page.tsx`

- [ ] **Step 1: Create the two pages**

```tsx
// apps/web/src/app/dashboard/academic-years/promote/history/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function PromotionHistoryPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Promotion History"
      description="A history log of past student promotions between academic years is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/academic-calendar/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AcademicCalendarPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Academic Calendar"
      description="A school-wide calendar of terms, holidays, and key academic dates is coming soon."
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — no errors referencing these two files.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/academic-years/promote/history apps/web/src/app/dashboard/academic-calendar
git commit -m "feat(nav): add School Management stub pages (Promotion History, Academic Calendar)"
```

---

### Task 7: Communication stub pages

**Files:**
- Create: `apps/web/src/app/dashboard/notifications/announcements/page.tsx`
- Create: `apps/web/src/app/dashboard/notifications/events/page.tsx`

- [ ] **Step 1: Create the two pages**

```tsx
// apps/web/src/app/dashboard/notifications/announcements/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AnnouncementsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Announcements"
      description="Publishing school-wide or class-specific announcements is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/notifications/events/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function EventsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Events" description="Scheduling and listing school events is coming soon." />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — no errors referencing these two files.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/notifications/announcements apps/web/src/app/dashboard/notifications/events
git commit -m "feat(nav): add Communication stub pages (Announcements, Events)"
```

---

### Task 8: Reports stub pages

**Files:**
- Create: `apps/web/src/app/dashboard/reports/students/page.tsx`
- Create: `apps/web/src/app/dashboard/reports/academic/page.tsx`
- Create: `apps/web/src/app/dashboard/reports/attendance/page.tsx`
- Create: `apps/web/src/app/dashboard/reports/staff/page.tsx`
- Create: `apps/web/src/app/dashboard/reports/fees/page.tsx`

- [ ] **Step 1: Create the five pages**

```tsx
// apps/web/src/app/dashboard/reports/students/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StudentReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Student Reports"
      description="Cross-cutting reports on student demographics and enrollment are coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/reports/academic/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AcademicReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Academic Reports"
      description="School-wide academic performance reports across classes are coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/reports/attendance/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AttendanceReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Attendance Reports"
      description="Aggregate attendance reports by class, subject, and date range are coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/reports/staff/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StaffReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Staff Reports"
      description="Staff headcount, attendance, and workload reports are coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/reports/fees/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function FeeReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Fee Reports"
      description="Collection and outstanding-balance summaries by class and term are coming soon."
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — no errors referencing these five files.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/reports
git commit -m "feat(nav): add top-level Reports stub pages (Student, Academic, Attendance, Staff, Fee)"
```

---

### Task 9: Workspace/Settings stub pages

**Files:**
- Create: `apps/web/src/app/dashboard/settings/users/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/permissions/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/system/page.tsx`

- [ ] **Step 1: Create the three pages**

```tsx
// apps/web/src/app/dashboard/settings/users/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function UsersAndRolesPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Users & Roles"
      description="Managing staff user accounts and their assigned roles is coming soon."
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/settings/permissions/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function PermissionsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Permissions" description="Fine-grained, per-feature permission controls are coming soon." />
  );
}
```

```tsx
// apps/web/src/app/dashboard/settings/system/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function SystemSettingsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="System Settings" description="School-wide system configuration options are coming soon." />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` — no errors referencing these three files.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/settings/users apps/web/src/app/dashboard/settings/permissions apps/web/src/app/dashboard/settings/system
git commit -m "feat(nav): add Workspace stub pages (Users & Roles, Permissions, System Settings)"
```

---

### Task 10: Extract Grade creation into a dedicated `/dashboard/grades/add` page

Today `GradesView.tsx` inlines both create and edit in one `<Modal>`. Create is being removed from it entirely and rebuilt as a small standalone page + client form component.

**Files:**
- Modify: `apps/web/src/components/school-setup/GradesView.tsx`
- Create: `apps/web/src/components/school-setup/AddGradeForm.tsx`
- Create: `apps/web/src/app/dashboard/grades/add/page.tsx`
- Modify: `apps/web/tests/grades-view.test.tsx`
- Create: `apps/web/tests/add-grade-page.test.tsx`

**Interfaces:**
- Produces: `AddGradeForm()` — a client component with no props, POSTs to `/api/grades`, redirects to `/dashboard/grades` on success.

- [ ] **Step 1: Narrow `GradesView`'s modal to edit-only**

In `apps/web/src/components/school-setup/GradesView.tsx`, replace the `ModalState` type:

```ts
// before
type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;
// after
type ModalState = { id: number } | null;
```

Remove `openCreate` and simplify `openEdit`:

```tsx
// before
  function openCreate() {
    setModalState({ mode: "create" });
    setName("");
    setError(null);
  }

  function openEdit(grade: GradeRow) {
    setModalState({ mode: "edit", id: grade.id });
    setName(grade.name);
    setError(null);
  }
// after
  function openEdit(grade: GradeRow) {
    setModalState({ id: grade.id });
    setName(grade.name);
    setError(null);
  }
```

Simplify `handleSave` to the edit-only path:

```tsx
// before
  async function handleSave() {
    setError(null);
    await run(async () => {
      if (modalState?.mode === "create") {
        const response = await fetch("/api/grades", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (response.status === 201) {
          closeModal();
          await refresh(yearFilter);
          return;
        }
        setError((await response.json()).error);
        return;
      }
      if (modalState?.mode === "edit") {
        const response = await fetch(`/api/grades/${modalState.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (response.ok) {
          closeModal();
          await refresh(yearFilter);
          return;
        }
        setError((await response.json()).error);
      }
    });
  }
// after
  async function handleSave() {
    if (!modalState) return;
    setError(null);
    await run(async () => {
      const response = await fetch(`/api/grades/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        closeModal();
        await refresh(yearFilter);
        return;
      }
      setError((await response.json()).error);
    });
  }
```

Simplify `editingGrade` and the create button:

```tsx
// before
  const editingGrade = modalState?.mode === "edit" ? grades.find((grade) => grade.id === modalState.id) : undefined;
// after
  const editingGrade = modalState ? grades.find((grade) => grade.id === modalState.id) : undefined;
```

```tsx
// before
        action={
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Create Grade
          </button>
        }
// after
        action={
          <Link
            href="/dashboard/grades/add"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Create Grade
          </Link>
        }
```

And the modal's title/heading (no more `mode` branch — `Link` is already imported at the top of this file):

```tsx
// before
      {modalState && (
        <Modal
          onClose={closeModal}
          title={modalState.mode === "create" ? "Create Grade" : editingGrade?.name ?? "Edit Grade"}
        >
          <h2 className="text-sm font-bold text-neutral-800">
            {modalState.mode === "create" ? "Create Grade" : editingGrade?.name}
          </h2>
// after
      {modalState && (
        <Modal onClose={closeModal} title={editingGrade?.name ?? "Edit Grade"}>
          <h2 className="text-sm font-bold text-neutral-800">{editingGrade?.name}</h2>
```

- [ ] **Step 2: Replace the old create test with a link-wiring test**

In `apps/web/tests/grades-view.test.tsx`, replace:

```tsx
// before
  it("creates a grade through the modal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 3, name: "Grade 3" }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([...grades, { id: 3, name: "Grade 3", subjectCount: 0, classCount: 0, subjectNames: [] }]), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Create Grade" }));
    await userEvent.type(screen.getByLabelText("Grade name"), "Grade 3");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("link", { name: "Grade 3" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
// after
  it("links Create Grade to the dedicated Add Grade page", () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "+ Create Grade" })).toHaveAttribute("href", "/dashboard/grades/add");
  });
```

- [ ] **Step 3: Run the updated GradesView tests**

Run: `cd apps/web && npx vitest run tests/grades-view.test.tsx` → PASS (5 tests: the 4 untouched ones plus the new link test).

- [ ] **Step 4: Write the failing test for the new Add Grade page**

```tsx
// apps/web/tests/add-grade-page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AddGradeForm } from "../src/components/school-setup/AddGradeForm";

describe("AddGradeForm", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("posts the entered name and redirects to the grades list on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 3, name: "Grade 3" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddGradeForm />);
    await userEvent.type(screen.getByLabelText("Grade name"), "Grade 3");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/grades",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Grade 3" }) })
    );
    expect(pushMock).toHaveBeenCalledWith("/dashboard/grades");
    vi.unstubAllGlobals();
  });

  it("shows a server error and does not redirect on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "A grade with this name already exists" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddGradeForm />);
    await userEvent.type(screen.getByLabelText("Grade name"), "Grade 1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("A grade with this name already exists")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/add-grade-page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 6: Write `AddGradeForm` and the page**

```tsx
// apps/web/src/components/school-setup/AddGradeForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

export function AddGradeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function handleSave() {
    setError(null);
    await run(async () => {
      const response = await fetch("/api/grades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.status === 201) {
        router.push("/dashboard/grades");
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={Layers} title="Add Grade" subtitle="Create a new grade level for your school" />
      <div className="flex max-w-sm flex-col gap-2 rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
        <input
          type="text"
          aria-label="Grade name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. Grade 1"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// apps/web/src/app/dashboard/grades/add/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { AddGradeForm } from "@/components/school-setup/AddGradeForm";

export default async function AddGradePage() {
  await requireDashboardRole(["admin"]);
  return (
    <div className="p-6">
      <AddGradeForm />
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/add-grade-page.test.tsx tests/grades-view.test.tsx` → PASS

- [ ] **Step 8: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` → no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/school-setup/GradesView.tsx apps/web/src/components/school-setup/AddGradeForm.tsx apps/web/src/app/dashboard/grades/add apps/web/tests/grades-view.test.tsx apps/web/tests/add-grade-page.test.tsx
git commit -m "feat(grades): extract grade creation into a dedicated /dashboard/grades/add page"
```

---

### Task 11: Extract Class creation into a dedicated `/dashboard/classes/add` page

Same shape as Task 10. One extra wrinkle: `ClassesView`'s `grades` prop and its `GradeOption` type are used **only** by the create-mode grade `<select>` being removed, so they come out of `ClassesView` entirely, cascading to its page and test file.

**Files:**
- Modify: `apps/web/src/components/school-setup/ClassesView.tsx`
- Modify: `apps/web/src/app/dashboard/classes/page.tsx`
- Modify: `apps/web/tests/classes-view.test.tsx`
- Create: `apps/web/src/components/school-setup/AddClassForm.tsx`
- Create: `apps/web/src/app/dashboard/classes/add/page.tsx`
- Create: `apps/web/tests/add-class-page.test.tsx`

**Interfaces:**
- Produces: `AddClassForm({ grades, academicYears }: { grades: {id:number;name:string}[]; academicYears: {id:number;name:string}[] })`.

- [ ] **Step 1: Narrow `ClassesView` to edit-only and drop the now-unused `grades`/`GradeOption`**

In `apps/web/src/components/school-setup/ClassesView.tsx`:

```ts
// before
type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;
// after
type ModalState = { id: number } | null;
```

Delete the `GradeOption` interface entirely (it's only used by the `grades` prop):

```ts
// delete this block
interface GradeOption {
  id: number;
  name: string;
}
```

```tsx
// before
export function ClassesView({
  initialClasses,
  grades,
  academicYears,
}: {
  initialClasses: ClassRow[];
  grades: GradeOption[];
  academicYears: AcademicYearOption[];
}) {
  const [classes, setClasses] = useState(initialClasses);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [gradeId, setGradeId] = useState(grades[0] ? String(grades[0].id) : "");
  const [section, setSection] = useState("");
  const [academicYearId, setAcademicYearId] = useState(academicYears[0] ? String(academicYears[0].id) : "");
  const [capacity, setCapacity] = useState("");
  const [room, setRoom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);
  const { isSubmitting, run } = useSubmitGuard();
// after
export function ClassesView({
  initialClasses,
  academicYears,
}: {
  initialClasses: ClassRow[];
  academicYears: AcademicYearOption[];
}) {
  const [classes, setClasses] = useState(initialClasses);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [section, setSection] = useState("");
  const [capacity, setCapacity] = useState("");
  const [room, setRoom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);
  const { isSubmitting, run } = useSubmitGuard();
```

Remove `openCreate`, simplify `openEdit`:

```tsx
// before
  function openCreate() {
    setModalState({ mode: "create" });
    setGradeId(grades[0] ? String(grades[0].id) : "");
    setSection("");
    setAcademicYearId(academicYears[0] ? String(academicYears[0].id) : "");
    setCapacity("");
    setRoom("");
    setError(null);
  }

  function openEdit(klass: ClassRow) {
    setModalState({ mode: "edit", id: klass.id });
    setSection(klass.section);
    setCapacity(klass.capacity != null ? String(klass.capacity) : "");
    setRoom(klass.room ?? "");
    setError(null);
  }
// after
  function openEdit(klass: ClassRow) {
    setModalState({ id: klass.id });
    setSection(klass.section);
    setCapacity(klass.capacity != null ? String(klass.capacity) : "");
    setRoom(klass.room ?? "");
    setError(null);
  }
```

Simplify `handleSave` to the edit-only path (validation stays, since it applied to edit too):

```tsx
// before
  async function handleSave() {
    setError(null);

    if (!section.trim()) {
      setError("Section is required");
      return;
    }
    if (capacity && Number(capacity) <= 0) {
      setError("Capacity must be greater than 0");
      return;
    }

    await run(async () => {
      if (modalState?.mode === "create") {
        const response = await fetch("/api/classes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            gradeId: Number(gradeId),
            section,
            academicYearId: Number(academicYearId),
            capacity: capacity ? Number(capacity) : undefined,
            room: room || undefined,
          }),
        });
        if (response.status === 201) {
          closeModal();
          await refresh(yearFilter);
          return;
        }
        setError((await response.json()).error);
        return;
      }
      if (modalState?.mode === "edit") {
        const response = await fetch(`/api/classes/${modalState.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            section,
            capacity: capacity ? Number(capacity) : undefined,
            room: room || undefined,
          }),
        });
        if (response.ok) {
          closeModal();
          await refresh(yearFilter);
          return;
        }
        setError((await response.json()).error);
      }
    });
  }
// after
  async function handleSave() {
    if (!modalState) return;
    setError(null);

    if (!section.trim()) {
      setError("Section is required");
      return;
    }
    if (capacity && Number(capacity) <= 0) {
      setError("Capacity must be greater than 0");
      return;
    }

    await run(async () => {
      const response = await fetch(`/api/classes/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section,
          capacity: capacity ? Number(capacity) : undefined,
          room: room || undefined,
        }),
      });
      if (response.ok) {
        closeModal();
        await refresh(yearFilter);
        return;
      }
      setError((await response.json()).error);
    });
  }
```

Add the `Link` import (not currently imported in this file) and change the create button:

```tsx
// before
import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
// after
import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
```

```tsx
// before
        action={
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Create Class
          </button>
        }
// after
        action={
          <Link
            href="/dashboard/classes/add"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            + Create Class
          </Link>
        }
```

Simplify the modal body to edit-only fields (drop both create-only `<select>`s and the `mode` branching on the title/heading):

```tsx
// before
      {modalState && (
        <Modal onClose={closeModal} title={modalState.mode === "create" ? "Create Class" : "Edit Class"}>
          <h2 className="text-sm font-bold text-neutral-800">
            {modalState.mode === "create" ? "Create Class" : "Edit Class"}
          </h2>
          {modalState.mode === "create" && (
            <select
              aria-label="Grade"
              value={gradeId}
              onChange={(event) => setGradeId(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            aria-label="Section"
            value={section}
            onChange={(event) => setSection(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. B"
          />
          {modalState.mode === "create" && (
            <select
              aria-label="Academic year"
              value={academicYearId}
              onChange={(event) => setAcademicYearId(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="number"
            min="1"
            aria-label="Capacity"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. 40"
          />
          <input
            type="text"
            aria-label="Room"
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. B-204"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Modal>
      )}
// after
      {modalState && (
        <Modal onClose={closeModal} title="Edit Class">
          <h2 className="text-sm font-bold text-neutral-800">Edit Class</h2>
          <input
            type="text"
            aria-label="Section"
            value={section}
            onChange={(event) => setSection(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. B"
          />
          <input
            type="number"
            min="1"
            aria-label="Capacity"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. 40"
          />
          <input
            type="text"
            aria-label="Room"
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. B-204"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Modal>
      )}
```

- [ ] **Step 2: Drop `grades`/`listGrades` from the Classes page**

```tsx
// apps/web/src/app/dashboard/classes/page.tsx — before
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listGrades } from "@/lib/school-setup/grades";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { ClassesView } from "@/components/school-setup/ClassesView";

export default async function ClassesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [classes, grades, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId, { includeArchived: true }),
    listGrades(prisma, claims.schoolId),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />
    </div>
  );
}
```

```tsx
// after
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { ClassesView } from "@/components/school-setup/ClassesView";

export default async function ClassesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [classes, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId, { includeArchived: true }),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <ClassesView initialClasses={classes} academicYears={academicYears} />
    </div>
  );
}
```

- [ ] **Step 3: Update `classes-view.test.tsx`**

`grades` is no longer a valid `ClassesView` prop, so:
1. Delete the fixture at the top: `const grades = [{ id: 1, name: "Grade 1" }];`.
2. Remove the ` grades={grades}` attribute from every `<ClassesView .../>` render call in this file (11 occurrences, all of the shape `render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />)`, plus one multi-line one around line 115 with `grades={grades}` on its own line — delete that line).
3. Replace the three create-mode tests with one link-wiring test:

```tsx
// delete these three tests
  it("rejects a class create with an empty section", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ClassesView initialClasses={classes} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Create Class" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/section is required/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("rejects a non-positive capacity on class create", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ClassesView initialClasses={classes} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Create Class" }));
    await userEvent.type(screen.getByLabelText("Section"), "C");
    await userEvent.type(screen.getByLabelText("Capacity"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/capacity must be greater than 0/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("sends capacity and room on class create", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 3, gradeId: 1, gradeName: "Grade 1", section: "C", academicYearId: 1, archived: false, capacity: 40, room: "B-204" }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(classes), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClassesView initialClasses={classes} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Create Class" }));
    await userEvent.type(screen.getByLabelText("Section"), "C");
    await userEvent.type(screen.getByLabelText("Capacity"), "40");
    await userEvent.type(screen.getByLabelText("Room"), "B-204");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.capacity).toBe(40);
    expect(body.room).toBe("B-204");
    vi.unstubAllGlobals();
  });
```

```tsx
// add this one instead
  it("links Create Class to the dedicated Add Class page", () => {
    render(<ClassesView initialClasses={classes} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "+ Create Class" })).toHaveAttribute("href", "/dashboard/classes/add");
  });
```

- [ ] **Step 4: Run the updated ClassesView tests**

Run: `cd apps/web && npx vitest run tests/classes-view.test.tsx` → PASS.

- [ ] **Step 5: Write the failing test for the new Add Class page**

```tsx
// apps/web/tests/add-class-page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AddClassForm } from "../src/components/school-setup/AddClassForm";

const grades = [{ id: 1, name: "Grade 1" }];
const academicYears = [{ id: 1, name: "2026-27" }];

describe("AddClassForm", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("rejects a class create with an empty section", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddClassForm grades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/section is required/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("rejects a non-positive capacity on class create", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddClassForm grades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Section"), "C");
    await userEvent.type(screen.getByLabelText("Capacity"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/capacity must be greater than 0/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("sends capacity and room, then redirects to the classes list", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 3, gradeId: 1, gradeName: "Grade 1", section: "C", academicYearId: 1, archived: false, capacity: 40, room: "B-204" }),
        { status: 201 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AddClassForm grades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Section"), "C");
    await userEvent.type(screen.getByLabelText("Capacity"), "40");
    await userEvent.type(screen.getByLabelText("Room"), "B-204");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.capacity).toBe(40);
    expect(body.room).toBe("B-204");
    expect(pushMock).toHaveBeenCalledWith("/dashboard/classes");
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/add-class-page.test.tsx` → FAIL, module not found.

- [ ] **Step 7: Write `AddClassForm` and the page**

```tsx
// apps/web/src/components/school-setup/AddClassForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

interface GradeOption {
  id: number;
  name: string;
}

interface AcademicYearOption {
  id: number;
  name: string;
}

export function AddClassForm({
  grades,
  academicYears,
}: {
  grades: GradeOption[];
  academicYears: AcademicYearOption[];
}) {
  const router = useRouter();
  const [gradeId, setGradeId] = useState(grades[0] ? String(grades[0].id) : "");
  const [section, setSection] = useState("");
  const [academicYearId, setAcademicYearId] = useState(academicYears[0] ? String(academicYears[0].id) : "");
  const [capacity, setCapacity] = useState("");
  const [room, setRoom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function handleSave() {
    setError(null);

    if (!section.trim()) {
      setError("Section is required");
      return;
    }
    if (capacity && Number(capacity) <= 0) {
      setError("Capacity must be greater than 0");
      return;
    }

    await run(async () => {
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gradeId: Number(gradeId),
          section,
          academicYearId: Number(academicYearId),
          capacity: capacity ? Number(capacity) : undefined,
          room: room || undefined,
        }),
      });
      if (response.status === 201) {
        router.push("/dashboard/classes");
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={Building2} title="Add Class" subtitle="Create a new class for your school" />
      <div className="flex max-w-sm flex-col gap-2 rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
        <select
          aria-label="Grade"
          value={gradeId}
          onChange={(event) => setGradeId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {grades.map((grade) => (
            <option key={grade.id} value={grade.id}>
              {grade.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Section"
          value={section}
          onChange={(event) => setSection(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. B"
        />
        <select
          aria-label="Academic year"
          value={academicYearId}
          onChange={(event) => setAcademicYearId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {academicYears.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          aria-label="Capacity"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. 40"
        />
        <input
          type="text"
          aria-label="Room"
          value={room}
          onChange={(event) => setRoom(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. B-204"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// apps/web/src/app/dashboard/classes/add/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listGrades } from "@/lib/school-setup/grades";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { AddClassForm } from "@/components/school-setup/AddClassForm";

export default async function AddClassPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [grades, academicYears] = await Promise.all([
    listGrades(prisma, claims.schoolId),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <AddClassForm grades={grades} academicYears={academicYears} />
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/add-class-page.test.tsx tests/classes-view.test.tsx` → PASS

- [ ] **Step 9: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` → no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/school-setup/ClassesView.tsx apps/web/src/components/school-setup/AddClassForm.tsx apps/web/src/app/dashboard/classes apps/web/tests/classes-view.test.tsx apps/web/tests/add-class-page.test.tsx
git commit -m "feat(classes): extract class creation into a dedicated /dashboard/classes/add page"
```

---

### Task 12: Extract Staff creation into a dedicated `/dashboard/staff/add` page

`StaffDetailModal` is already a separate, reusable component (unlike Grades/Classes), so this uses a different technique: add one `variant?: "modal" | "page"` prop (default `"modal"`) that swaps the outer `<Modal>` wrapper for a plain page card, with **zero duplication** of the ~200 lines of field markup in between. All 10 existing `staff-detail-modal.test.tsx` tests exercise the default `variant="modal"` and are untouched.

**Files:**
- Modify: `apps/web/src/components/school-setup/StaffDetailModal.tsx`
- Modify: `apps/web/tests/staff-detail-modal.test.tsx` (additive: one new test)
- Modify: `apps/web/src/components/school-setup/StaffView.tsx`
- Modify: `apps/web/tests/staff-view.test.tsx`
- Create: `apps/web/src/app/dashboard/staff/add/page.tsx`
- Create: `apps/web/tests/add-staff-page.test.tsx`

**Interfaces:**
- Produces: `StaffDetailModal`'s new `variant?: "modal" | "page"` prop, defaulting to `"modal"`.

- [ ] **Step 1: Add the `variant` prop to `StaffDetailModal`**

In `apps/web/src/components/school-setup/StaffDetailModal.tsx`, extend the props:

```tsx
// before
export function StaffDetailModal({
  mode,
  staff,
  classes,
  subjects,
  isSelf,
  serverError,
  deleteBlocked,
  isSubmitting = false,
  onClose,
  onSave,
  onDelete,
  onDeactivate,
  onCancelDelete,
  onActivate,
}: {
  mode: "create" | "edit";
  staff?: StaffRow;
// after
export function StaffDetailModal({
  mode,
  variant = "modal",
  staff,
  classes,
  subjects,
  isSelf,
  serverError,
  deleteBlocked,
  isSubmitting = false,
  onClose,
  onSave,
  onDelete,
  onDeactivate,
  onCancelDelete,
  onActivate,
}: {
  mode: "create" | "edit";
  variant?: "modal" | "page";
  staff?: StaffRow;
```

Then wrap the return: change the top of the `return (` statement to open a `content` fragment instead of the `<Modal>` directly, and change the bottom to close the fragment and branch on `variant`. **Everything between these two anchors (the `{mode === "edit" && staff && (...)}` info block, the name/phone/role/class/subject fields, the `FormSection` of employment fields, and the error/Save/Delete/Deactivate/Activate button row) stays byte-for-byte unchanged** — only re-parented from inside `<Modal>...</Modal>` to inside `<>...</>`.

```tsx
// before (top of the return statement)
  return (
    <Modal onClose={onClose} title={mode === "create" ? "Add new staff" : staff?.name ?? "Edit staff"}>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new staff" : staff?.name}
      </h2>
// after
  const content = (
    <>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new staff" : staff?.name}
      </h2>
```

```tsx
// before (bottom of the return statement)
      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{staff?.name} has recorded activity and cannot be permanently deleted.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
// after
      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{staff?.name} has recorded activity and cannot be permanently deleted.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (variant === "page") {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
        {content}
      </div>
    );
  }

  return (
    <Modal onClose={onClose} title={mode === "create" ? "Add new staff" : staff?.name ?? "Edit staff"}>
      {content}
    </Modal>
  );
}
```

- [ ] **Step 2: Add one test for `variant="page"`**

Append to `apps/web/tests/staff-detail-modal.test.tsx` (uses the file's existing `classes`, `subjects`, `noop` fixtures):

```tsx
  it("variant page: renders fields without the modal dialog wrapper", () => {
    render(
      <StaffDetailModal
        mode="create"
        variant="page"
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run `StaffDetailModal` tests**

Run: `cd apps/web && npx vitest run tests/staff-detail-modal.test.tsx` → PASS (11 tests: the original 10 plus this one).

- [ ] **Step 4: Narrow `StaffView` to edit-only**

In `apps/web/src/components/school-setup/StaffView.tsx`:

```ts
// before
type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;
// after
type ModalState = { id: number } | null;
```

```tsx
// before
  function openCreate() {
    setModalState({ mode: "create" });
    setError(null);
    setDeleteBlockedId(null);
  }

  function openEdit(id: number) {
    setModalState({ mode: "edit", id });
    setError(null);
    setDeleteBlockedId(null);
  }
// after
  function openEdit(id: number) {
    setModalState({ id });
    setError(null);
    setDeleteBlockedId(null);
  }
```

Simplify `handleSave` to the edit-only path:

```tsx
// before
  async function handleSave(fields: SaveStaffFields) {
    setError(null);

    await run(async () => {
      let photoUrl: string | undefined;
      if (fields.photoFile) {
        const uploadResult = await uploadPhoto(fields.photoFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        photoUrl = uploadResult.photoUrl;
      }

      if (modalState?.mode === "create") {
        const response = await fetch("/api/staff", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: fields.name,
            phone: fields.phone,
            role: fields.role,
            classId: fields.classId ?? undefined,
            subjectId: fields.subjectId ?? undefined,
            email: fields.email || undefined,
            qualification: fields.qualification || undefined,
            designation: fields.designation || undefined,
            joiningDate: fields.joiningDate || undefined,
            salary: fields.salary !== "" ? Number(fields.salary) : undefined,
            address: fields.address || undefined,
            photoUrl,
          }),
        });
        if (response.status === 201) {
          await refresh();
          closeModal();
          return;
        }
        setError((await response.json()).error);
        return;
      }

      if (modalState?.mode === "edit") {
        const body: {
          name: string;
          phone: string;
          role: Role;
          classId: number | null;
          subjectId: number | null;
          email?: string;
          qualification?: string;
          designation?: string;
          joiningDate?: string;
          salary?: number;
          address?: string;
          photoUrl?: string;
        } = {
          name: fields.name,
          phone: fields.phone,
          role: fields.role,
          classId: fields.classId,
          subjectId: fields.subjectId,
        };
        if (fields.email) body.email = fields.email;
        if (fields.qualification) body.qualification = fields.qualification;
        if (fields.designation) body.designation = fields.designation;
        if (fields.joiningDate) body.joiningDate = fields.joiningDate;
        if (fields.salary !== "") body.salary = Number(fields.salary);
        if (fields.address) body.address = fields.address;
        if (photoUrl) body.photoUrl = photoUrl;

        const response = await fetch(`/api/staff/${modalState.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.ok) {
          await refresh();
          closeModal();
          return;
        }
        setError((await response.json()).error);
      }
    });
  }
// after
  async function handleSave(fields: SaveStaffFields) {
    if (!modalState) return;
    setError(null);

    await run(async () => {
      let photoUrl: string | undefined;
      if (fields.photoFile) {
        const uploadResult = await uploadPhoto(fields.photoFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        photoUrl = uploadResult.photoUrl;
      }

      const body: {
        name: string;
        phone: string;
        role: Role;
        classId: number | null;
        subjectId: number | null;
        email?: string;
        qualification?: string;
        designation?: string;
        joiningDate?: string;
        salary?: number;
        address?: string;
        photoUrl?: string;
      } = {
        name: fields.name,
        phone: fields.phone,
        role: fields.role,
        classId: fields.classId,
        subjectId: fields.subjectId,
      };
      if (fields.email) body.email = fields.email;
      if (fields.qualification) body.qualification = fields.qualification;
      if (fields.designation) body.designation = fields.designation;
      if (fields.joiningDate) body.joiningDate = fields.joiningDate;
      if (fields.salary !== "") body.salary = Number(fields.salary);
      if (fields.address) body.address = fields.address;
      if (photoUrl) body.photoUrl = photoUrl;

      const response = await fetch(`/api/staff/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        await refresh();
        closeModal();
        return;
      }
      setError((await response.json()).error);
    });
  }
```

Update the three action handlers' now-simpler guards (same transformation in each: `modalState?.mode !== "edit"` → `!modalState`, inner `modalState.mode !== "edit"` → `!modalState`):

```tsx
// before
  async function handleDelete() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    await run(async () => {
      if (modalState.mode !== "edit") return;
      const response = await fetch(`/api/staff/${modalState.id}`, { method: "DELETE" });
// after
  async function handleDelete() {
    if (!modalState) return;
    setError(null);
    await run(async () => {
      if (!modalState) return;
      const response = await fetch(`/api/staff/${modalState.id}`, { method: "DELETE" });
```

```tsx
// before
  async function handleDeactivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    await run(async () => {
      if (modalState.mode !== "edit") return;
      const response = await fetch(`/api/staff/${modalState.id}/deactivate`, { method: "PATCH" });
// after
  async function handleDeactivate() {
    if (!modalState) return;
    setError(null);
    await run(async () => {
      if (!modalState) return;
      const response = await fetch(`/api/staff/${modalState.id}/deactivate`, { method: "PATCH" });
```

```tsx
// before
  async function handleActivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    await run(async () => {
      if (modalState.mode !== "edit") return;
      const response = await fetch(`/api/staff/${modalState.id}/activate`, { method: "PATCH" });
// after
  async function handleActivate() {
    if (!modalState) return;
    setError(null);
    await run(async () => {
      if (!modalState) return;
      const response = await fetch(`/api/staff/${modalState.id}/activate`, { method: "PATCH" });
```

Add the `Link` import and change the create button, `editingStaff`, and the `StaffDetailModal` render call:

```tsx
// before
import { useMemo, useState } from "react";
import { StaffCard, type StaffRow } from "./StaffCard";
// after
import { useMemo, useState } from "react";
import Link from "next/link";
import { StaffCard, type StaffRow } from "./StaffCard";
```

```tsx
// before
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Add new staff
        </button>
// after
        <Link
          href="/dashboard/staff/add"
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Add new staff
        </Link>
```

```tsx
// before
  const editingStaff = modalState?.mode === "edit" ? staff.find((member) => member.id === modalState.id) : undefined;
// after
  const editingStaff = modalState ? staff.find((member) => member.id === modalState.id) : undefined;
```

```tsx
// before
      {modalState && (
        <StaffDetailModal
          mode={modalState.mode}
          staff={editingStaff}
          classes={classes}
          subjects={subjects}
          isSelf={modalState.mode === "edit" && modalState.id === currentUserId}
          serverError={error}
          deleteBlocked={modalState.mode === "edit" && deleteBlockedId === modalState.id}
          isSubmitting={isSubmitting}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onDeactivate={handleDeactivate}
          onCancelDelete={() => setDeleteBlockedId(null)}
          onActivate={handleActivate}
        />
      )}
// after
      {modalState && (
        <StaffDetailModal
          mode="edit"
          staff={editingStaff}
          classes={classes}
          subjects={subjects}
          isSelf={modalState.id === currentUserId}
          serverError={error}
          deleteBlocked={deleteBlockedId === modalState.id}
          isSubmitting={isSubmitting}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onDeactivate={handleDeactivate}
          onCancelDelete={() => setDeleteBlockedId(null)}
          onActivate={handleActivate}
        />
      )}
```

- [ ] **Step 5: Remove the four create-flow tests from `staff-view.test.tsx`, add one link test**

Delete these four `it(...)` blocks:

```tsx
  it("opens the create modal from Add new staff and posts on Save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Person", phone: "+15559997777" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(staff), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Add new staff" }));
    await userEvent.type(screen.getByLabelText("Name"), "New Person");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559997777");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "accountant");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/staff", expect.objectContaining({ method: "POST" }));
    });
  });
```

```tsx
  it("sends email and HR fields on create", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Teacher", phone: "+919876543210" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={[]} classes={classes} subjects={subjects} currentUserId={1} />);

    await userEvent.click(screen.getByRole("button", { name: /add new staff/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/email/i), "teacher@example.com");
    await userEvent.type(screen.getByLabelText(/qualification/i), "M.Sc., B.Ed.");
    await userEvent.type(screen.getByLabelText(/designation/i), "Senior Teacher");
    await userEvent.type(screen.getByLabelText(/joining date/i), "2020-06-01");
    await userEvent.type(screen.getByLabelText(/salary/i), "45000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST")!;
    const body = JSON.parse(postCall[1].body);
    expect(body.email).toBe("teacher@example.com");
    expect(body.qualification).toBe("M.Sc., B.Ed.");
    expect(body.designation).toBe("Senior Teacher");
    expect(body.joiningDate).toBe("2020-06-01");
    expect(body.salary).toBe(45000);
  });
```

```tsx
  it("rejects a malformed email before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={[]} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /add new staff/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
```

```tsx
  it("rejects a negative salary before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={[]} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /add new staff/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/salary/i), "-100");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
```

Add this one instead:

```tsx
  it("links Add new staff to the dedicated Add Staff page", () => {
    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    expect(screen.getByRole("link", { name: "Add new staff" })).toHaveAttribute("href", "/dashboard/staff/add");
  });
```

- [ ] **Step 6: Run `StaffView` tests**

Run: `cd apps/web && npx vitest run tests/staff-view.test.tsx` → PASS.

- [ ] **Step 7: Write the failing test for the new Add Staff page**

```tsx
// apps/web/tests/add-staff-page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AddStaffPage } from "../src/components/school-setup/AddStaffPage";

const classes = [{ id: 1, gradeId: 10, gradeName: "Grade 5", section: "A" }];
const subjects = [{ id: 1, name: "Math", gradeId: 10 }];

describe("AddStaffPage", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("posts new staff and redirects to the staff list on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Person", phone: "+15559997777" }), { status: 201 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStaffPage classes={classes} subjects={subjects} />);
    await userEvent.type(screen.getByLabelText("Name"), "New Person");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559997777");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "accountant");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/staff", expect.objectContaining({ method: "POST" }));
    });
    expect(pushMock).toHaveBeenCalledWith("/dashboard/staff");
  });

  it("sends email and HR fields on create", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Teacher", phone: "+919876543210" }), { status: 201 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStaffPage classes={classes} subjects={subjects} />);
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/email/i), "teacher@example.com");
    await userEvent.type(screen.getByLabelText(/qualification/i), "M.Sc., B.Ed.");
    await userEvent.type(screen.getByLabelText(/designation/i), "Senior Teacher");
    await userEvent.type(screen.getByLabelText(/joining date/i), "2020-06-01");
    await userEvent.type(screen.getByLabelText(/salary/i), "45000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.email).toBe("teacher@example.com");
    expect(body.qualification).toBe("M.Sc., B.Ed.");
    expect(body.designation).toBe("Senior Teacher");
    expect(body.joiningDate).toBe("2020-06-01");
    expect(body.salary).toBe(45000);
  });

  it("rejects a malformed email before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStaffPage classes={classes} subjects={subjects} />);
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a negative salary before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStaffPage classes={classes} subjects={subjects} />);
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/salary/i), "-100");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/add-staff-page.test.tsx` → FAIL, module not found.

- [ ] **Step 9: Write `AddStaffPage` and the route**

`AddStaffPage` is a thin client wrapper that owns the create-POST logic and renders `StaffDetailModal` with `variant="page"` — `mode="create"` already hides every edit-only control (Delete/Deactivate/Activate/the info block) via that component's own `mode === "edit"` guards, so the inert callbacks below are simply never invoked.

```tsx
// apps/web/src/components/school-setup/AddStaffPage.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaffDetailModal, type SaveStaffFields } from "./StaffDetailModal";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

function noop() {}

async function uploadPhoto(file: File): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/staff/upload-photo", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json();
    return { ok: false, error: body.error };
  }
  const body = await response.json();
  return { ok: true, photoUrl: body.photoUrl };
}

export function AddStaffPage({
  classes,
  subjects,
}: {
  classes: { id: number; gradeId: number; gradeName: string; section: string }[];
  subjects: { id: number; name: string; gradeId: number }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function handleSave(fields: SaveStaffFields) {
    setError(null);
    await run(async () => {
      let photoUrl: string | undefined;
      if (fields.photoFile) {
        const uploadResult = await uploadPhoto(fields.photoFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        photoUrl = uploadResult.photoUrl;
      }

      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          phone: fields.phone,
          role: fields.role,
          classId: fields.classId ?? undefined,
          subjectId: fields.subjectId ?? undefined,
          email: fields.email || undefined,
          qualification: fields.qualification || undefined,
          designation: fields.designation || undefined,
          joiningDate: fields.joiningDate || undefined,
          salary: fields.salary !== "" ? Number(fields.salary) : undefined,
          address: fields.address || undefined,
          photoUrl,
        }),
      });
      if (response.status === 201) {
        router.push("/dashboard/staff");
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <StaffDetailModal
      mode="create"
      variant="page"
      classes={classes}
      subjects={subjects}
      isSelf={false}
      serverError={error}
      deleteBlocked={false}
      isSubmitting={isSubmitting}
      onClose={noop}
      onSave={handleSave}
      onDelete={noop}
      onDeactivate={noop}
      onCancelDelete={noop}
      onActivate={noop}
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/staff/add/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAllSubjects } from "@/lib/school-setup/subjects";
import { prisma } from "@/lib/prisma";
import { AddStaffPage } from "@/components/school-setup/AddStaffPage";

export default async function AddStaffRoute() {
  const claims = await requireDashboardRole(["admin"]);
  const [classes, subjects] = await Promise.all([
    listClasses(prisma, claims.schoolId),
    listAllSubjects(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <AddStaffPage classes={classes} subjects={subjects} />
    </div>
  );
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/add-staff-page.test.tsx tests/staff-view.test.tsx tests/staff-detail-modal.test.tsx` → PASS

- [ ] **Step 11: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` → no errors.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/components/school-setup/StaffDetailModal.tsx apps/web/src/components/school-setup/StaffView.tsx apps/web/src/components/school-setup/AddStaffPage.tsx apps/web/src/app/dashboard/staff/add apps/web/tests/staff-detail-modal.test.tsx apps/web/tests/staff-view.test.tsx apps/web/tests/add-staff-page.test.tsx
git commit -m "feat(staff): extract staff creation into a dedicated /dashboard/staff/add page"
```

---

### Task 13: Extract Student creation into a dedicated `/dashboard/students/add` page

Same `variant` technique as Task 12, applied to `StudentDetailModal`. One intentional UX drop: today, opening the create modal from `StudentsView` pre-fills the class from whatever class filter is currently selected in the list (`defaultClassId={selectedClass?.id}`, only meaningful in `mode === "create"`). A standalone `/add` page has no "currently filtered class" to inherit, so that convenience is dropped, not replicated — not requested, and not worth inventing a `?classId=` query-param mechanism for.

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentDetailModal.tsx`
- Modify: `apps/web/tests/student-detail-modal.test.tsx` (additive: one new test)
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx`
- Modify: `apps/web/tests/students-view.test.tsx`
- Create: `apps/web/src/components/school-setup/AddStudentPage.tsx`
- Create: `apps/web/src/app/dashboard/students/add/page.tsx`
- Create: `apps/web/tests/add-student-page.test.tsx`

- [ ] **Step 1: Add the `variant` prop to `StudentDetailModal`**

In `apps/web/src/components/school-setup/StudentDetailModal.tsx`:

```tsx
// before
export function StudentDetailModal({
  mode,
  student,
  classes,
  allStudents,
  isAdmin,
  defaultClassId,
  serverError,
  deleteBlocked,
  isSubmitting = false,
  onClose,
  onSave,
  onDelete,
  onDeactivate,
  onCancelDelete,
  onActivate,
}: {
  mode: "create" | "edit";
  student?: StudentRow;
// after
export function StudentDetailModal({
  mode,
  variant = "modal",
  student,
  classes,
  allStudents,
  isAdmin,
  defaultClassId,
  serverError,
  deleteBlocked,
  isSubmitting = false,
  onClose,
  onSave,
  onDelete,
  onDeactivate,
  onCancelDelete,
  onActivate,
}: {
  mode: "create" | "edit";
  variant?: "modal" | "page";
  student?: StudentRow;
```

Wrap the return the same way as Task 12. **Everything between these two anchors (lines ~174–706: Student Details, Guardian/Parent rows, sibling rows, and the error/Save/Delete/Deactivate/Activate row) is unchanged** — only re-parented from `<Modal>...</Modal>` into `<>...</>`.

```tsx
// before (top of the return statement)
  return (
    <Modal
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={mode === "create" ? "Add new student" : student?.name ?? "Edit student"}
    >
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new student" : student?.name}
      </h2>
// after
  const content = (
    <>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new student" : student?.name}
      </h2>
```

```tsx
// before (bottom of the return statement)
      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{student?.name} has recorded history and cannot be permanently deleted.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
// after
      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{student?.name} has recorded history and cannot be permanently deleted.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (variant === "page") {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
        {content}
      </div>
    );
  }

  return (
    <Modal
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={mode === "create" ? "Add new student" : student?.name ?? "Edit student"}
    >
      {content}
    </Modal>
  );
}
```

- [ ] **Step 2: Add one test for `variant="page"`**

Append to `apps/web/tests/student-detail-modal.test.tsx` (uses the file's existing `classes`, `allStudents`, `noop` fixtures):

```tsx
  it("variant page: renders fields without the modal dialog wrapper", () => {
    render(
      <StudentDetailModal
        mode="create"
        variant="page"
        classes={classes}
        allStudents={allStudents}
        isAdmin={true}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run `StudentDetailModal` tests**

Run: `cd apps/web && npx vitest run tests/student-detail-modal.test.tsx` → PASS (14 tests: the original 13 plus this one).

- [ ] **Step 4: Narrow `StudentsView` to edit-only**

In `apps/web/src/components/school-setup/StudentsView.tsx`:

```ts
// before
type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;
// after
type ModalState = { id: number } | null;
```

```tsx
// before
  function openCreate() {
    setModalState({ mode: "create" });
    setError(null);
    setDeleteBlockedId(null);
  }

  function openEdit(id: number) {
    setModalState({ mode: "edit", id });
    setError(null);
    setDeleteBlockedId(null);
  }
// after
  function openEdit(id: number) {
    setModalState({ id });
    setError(null);
    setDeleteBlockedId(null);
  }
```

Simplify `handleSave` to the edit-only path:

```tsx
// before
  async function handleSave(fields: SaveStudentFields) {
    setError(null);

    await run(async () => {
      let photoUrl: string | undefined;
      if (fields.photoFile) {
        const uploadResult = await uploadPhoto(fields.photoFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        photoUrl = uploadResult.photoUrl;
      }

      if (modalState?.mode === "create") {
        const response = await fetch("/api/students", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: fields.name,
            dob: fields.dob,
            classId: fields.classId ?? undefined,
            admissionNo: fields.admissionNo,
            rollNumber: fields.rollNumber || undefined,
            photoUrl,
            gender: fields.gender || undefined,
            studentIdNumber: fields.studentIdNumber || undefined,
            dateOfJoin: fields.dateOfJoin || undefined,
            address: fields.address || undefined,
            bloodGroup: fields.bloodGroup || undefined,
            nationality: fields.nationality || undefined,
            religion: fields.religion || undefined,
            previousSchool: fields.previousSchool || undefined,
            emergencyContactName: fields.emergencyContactName || undefined,
            emergencyContactPhone: fields.emergencyContactPhone || undefined,
            category: fields.category || undefined,
            admissionDate: fields.admissionDate || undefined,
            parents: fields.parents.map((p) => ({
              relationship: p.relationship,
              name: `${p.firstName} ${p.lastName}`.trim(),
              phone: p.phone,
              email: p.email || undefined,
            })),
            siblingStudentIds: fields.siblingStudentIds,
          }),
        });
        if (response.status === 201) {
          await refresh();
          closeModal();
          return;
        }
        setError((await response.json()).error);
        return;
      }

      if (modalState?.mode === "edit") {
        const body: {
          name: string;
          admissionNo: string;
          dob?: string;
          classId?: number;
          rollNumber?: string;
          photoUrl?: string;
          gender?: "male" | "female" | "other";
          studentIdNumber?: string;
          dateOfJoin?: string;
          address?: string;
          bloodGroup?: string;
          nationality?: string;
          religion?: string;
          previousSchool?: string;
          emergencyContactName?: string;
          emergencyContactPhone?: string;
          category?: string;
          admissionDate?: string;
          parents?: { relationship: string; name: string; phone: string; email?: string }[];
          siblingStudentIds?: number[];
        } = {
          name: fields.name,
          admissionNo: fields.admissionNo,
        };
        if (fields.dob) body.dob = fields.dob;
        if (fields.classId) body.classId = fields.classId;
        if (fields.rollNumber) body.rollNumber = fields.rollNumber;
        if (photoUrl) body.photoUrl = photoUrl;
        if (fields.gender) body.gender = fields.gender;
        if (fields.studentIdNumber) body.studentIdNumber = fields.studentIdNumber;
        if (fields.dateOfJoin) body.dateOfJoin = fields.dateOfJoin;
        if (fields.address) body.address = fields.address;
        if (fields.bloodGroup) body.bloodGroup = fields.bloodGroup;
        if (fields.nationality) body.nationality = fields.nationality;
        if (fields.religion) body.religion = fields.religion;
        if (fields.previousSchool) body.previousSchool = fields.previousSchool;
        if (fields.emergencyContactName) body.emergencyContactName = fields.emergencyContactName;
        if (fields.emergencyContactPhone) body.emergencyContactPhone = fields.emergencyContactPhone;
        if (fields.category) body.category = fields.category;
        if (fields.admissionDate) body.admissionDate = fields.admissionDate;
        body.parents = fields.parents.map((p) => ({
          relationship: p.relationship,
          name: `${p.firstName} ${p.lastName}`.trim(),
          phone: p.phone,
          email: p.email || undefined,
        }));
        body.siblingStudentIds = fields.siblingStudentIds;

        const response = await fetch(`/api/students/${modalState.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.ok) {
          await refresh();
          closeModal();
          return;
        }
        setError((await response.json()).error);
      }
    });
  }
// after
  async function handleSave(fields: SaveStudentFields) {
    if (!modalState) return;
    setError(null);

    await run(async () => {
      let photoUrl: string | undefined;
      if (fields.photoFile) {
        const uploadResult = await uploadPhoto(fields.photoFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        photoUrl = uploadResult.photoUrl;
      }

      const body: {
        name: string;
        admissionNo: string;
        dob?: string;
        classId?: number;
        rollNumber?: string;
        photoUrl?: string;
        gender?: "male" | "female" | "other";
        studentIdNumber?: string;
        dateOfJoin?: string;
        address?: string;
        bloodGroup?: string;
        nationality?: string;
        religion?: string;
        previousSchool?: string;
        emergencyContactName?: string;
        emergencyContactPhone?: string;
        category?: string;
        admissionDate?: string;
        parents?: { relationship: string; name: string; phone: string; email?: string }[];
        siblingStudentIds?: number[];
      } = {
        name: fields.name,
        admissionNo: fields.admissionNo,
      };
      if (fields.dob) body.dob = fields.dob;
      if (fields.classId) body.classId = fields.classId;
      if (fields.rollNumber) body.rollNumber = fields.rollNumber;
      if (photoUrl) body.photoUrl = photoUrl;
      if (fields.gender) body.gender = fields.gender;
      if (fields.studentIdNumber) body.studentIdNumber = fields.studentIdNumber;
      if (fields.dateOfJoin) body.dateOfJoin = fields.dateOfJoin;
      if (fields.address) body.address = fields.address;
      if (fields.bloodGroup) body.bloodGroup = fields.bloodGroup;
      if (fields.nationality) body.nationality = fields.nationality;
      if (fields.religion) body.religion = fields.religion;
      if (fields.previousSchool) body.previousSchool = fields.previousSchool;
      if (fields.emergencyContactName) body.emergencyContactName = fields.emergencyContactName;
      if (fields.emergencyContactPhone) body.emergencyContactPhone = fields.emergencyContactPhone;
      if (fields.category) body.category = fields.category;
      if (fields.admissionDate) body.admissionDate = fields.admissionDate;
      body.parents = fields.parents.map((p) => ({
        relationship: p.relationship,
        name: `${p.firstName} ${p.lastName}`.trim(),
        phone: p.phone,
        email: p.email || undefined,
      }));
      body.siblingStudentIds = fields.siblingStudentIds;

      const response = await fetch(`/api/students/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        await refresh();
        closeModal();
        return;
      }
      setError((await response.json()).error);
    });
  }
```

Update `handleDelete`/`handleDeactivate`/`handleActivate` the same way as Task 12 (`modalState?.mode !== "edit"` → `!modalState`, inner guard too), add the `Link` import, and update the button, `editingStudent`, and the render call:

```tsx
// before
import { useMemo, useState } from "react";
import { StudentCard, type StudentRow } from "./StudentCard";
// after
import { useMemo, useState } from "react";
import Link from "next/link";
import { StudentCard, type StudentRow } from "./StudentCard";
```

```tsx
// before
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Add new student
          </button>
        )}
// after
        {isAdmin && (
          <Link
            href="/dashboard/students/add"
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Add new student
          </Link>
        )}
```

```tsx
// before
  const editingStudent =
    modalState?.mode === "edit" ? students.find((student) => student.id === modalState.id) : undefined;
// after
  const editingStudent = modalState ? students.find((student) => student.id === modalState.id) : undefined;
```

```tsx
// before
      {modalState && (
        <StudentDetailModal
          mode={modalState.mode}
          student={editingStudent}
          classes={classes}
          allStudents={students}
          isAdmin={isAdmin}
          defaultClassId={selectedClass?.id}
          serverError={error}
          deleteBlocked={modalState.mode === "edit" && deleteBlockedId === modalState.id}
          isSubmitting={isSubmitting}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onDeactivate={handleDeactivate}
          onCancelDelete={() => setDeleteBlockedId(null)}
          onActivate={handleActivate}
        />
      )}
// after
      {modalState && (
        <StudentDetailModal
          mode="edit"
          student={editingStudent}
          classes={classes}
          allStudents={students}
          isAdmin={isAdmin}
          defaultClassId={selectedClass?.id}
          serverError={error}
          deleteBlocked={deleteBlockedId === modalState.id}
          isSubmitting={isSubmitting}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onDeactivate={handleDeactivate}
          onCancelDelete={() => setDeleteBlockedId(null)}
          onActivate={handleActivate}
        />
      )}
```

- [ ] **Step 5: Remove the five create-flow tests from `students-view.test.tsx`, update one, add one link test**

Delete these five `it(...)` blocks (photo upload, class-filter prefill, admission fields, and the two static-options tests — the latter two are re-added in Step 7 against the new page instead, since they test fields that live inside `StudentDetailModal` regardless of wrapper):

```tsx
  it("uploads the selected photo first, then includes the returned photoUrl in the create request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ photoUrl: "/uploads/students/abc.png" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Student", admissionNo: "SCH-3" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(students), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={[]} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: "Add new student" }));

    await userEvent.type(screen.getByLabelText("First name"), "New");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-3");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Add parent" }));
    await userEvent.type(screen.getByLabelText("Parent 1 first name"), "A");
    await userEvent.type(screen.getByLabelText("Parent 1 last name"), "Parent");
    await userEvent.type(screen.getByLabelText("Parent 1 mobile number"), "+15550009999");

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Photo"), file);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "/api/students/upload-photo",
        expect.objectContaining({ method: "POST" })
      );
    });
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.photoUrl).toBe("/uploads/students/abc.png");
    expect(secondCallBody.rollNumber).toBe("1");
  });

  it("pre-fills the selected class filter into the create modal", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by class"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Add new student" }));
    expect((screen.getByLabelText("Class") as HTMLSelectElement).value).toBe("2");
  });
```

```tsx
  it("sends every admission field on create", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={[]} classes={classes} isAdmin={true} />);

    await userEvent.click(screen.getByRole("button", { name: /add.*student/i }));
    await userEvent.type(screen.getByLabelText(/^first name/i), "New");
    await userEvent.type(screen.getByLabelText(/^last name/i), "Student");
    await userEvent.type(screen.getByLabelText(/date of birth/i), "2015-01-01");
    await userEvent.type(screen.getByLabelText(/admission number/i), "NEW-001");
    await userEvent.type(screen.getByLabelText(/^address/i), "12 Example Road");
    await userEvent.type(screen.getByLabelText(/blood group/i), "O+");
    await userEvent.type(screen.getByLabelText(/emergency contact name/i), "Aunt");
    await userEvent.type(screen.getByLabelText(/emergency contact phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/previous school/i), "Little Flower LP");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.address).toBe("12 Example Road");
    expect(body.bloodGroup).toBe("O+");
    expect(body.emergencyContactName).toBe("Aunt");
    expect(body.emergencyContactPhone).toBe("+919876543210");
    expect(body.previousSchool).toBe("Little Flower LP");
  });

  it("offers a third gender option", async () => {
    render(<StudentsView initialStudents={[]} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: /add.*student/i }));

    const select = screen.getByLabelText(/gender/i);
    const options = within(select).getAllByRole("option").map((o) => o.getAttribute("value"));

    expect(options).toEqual(expect.arrayContaining(["male", "female", "other"]));
  });

  it("offers guardian relationship as a fixed list, not free text", async () => {
    render(<StudentsView initialStudents={[]} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: /add.*student/i }));
    await userEvent.click(screen.getByRole("button", { name: /add parent/i }));

    const select = screen.getByLabelText(/relationship/i);
    expect(select.tagName).toBe("SELECT");
    const options = within(select).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(
      expect.arrayContaining(["father", "mother", "guardian", "grandparent", "sibling", "other"])
    );
  });
```

Add this one instead:

```tsx
  it("links Add new student to the dedicated Add Student page", () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    expect(screen.getByRole("link", { name: "Add new student" })).toHaveAttribute("href", "/dashboard/students/add");
  });
```

Update the non-admin test's role query from `"button"` to `"link"` (there's never a button now, only a conditionally-rendered link):

```tsx
// before
  it("non-admin can open a card but sees no Save button", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: "Add new student" })).not.toBeInTheDocument();
// after
  it("non-admin can open a card but sees no Save button", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={false} />);
    expect(screen.queryByRole("link", { name: "Add new student" })).not.toBeInTheDocument();
```

- [ ] **Step 6: Run `StudentsView` tests**

Run: `cd apps/web && npx vitest run tests/students-view.test.tsx` → PASS.

- [ ] **Step 7: Write the failing test for the new Add Student page**

```tsx
// apps/web/tests/add-student-page.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AddStudentPage } from "../src/components/school-setup/AddStudentPage";

const classes = [
  { id: 1, gradeName: "Grade 5", section: "A" },
  { id: 2, gradeName: "Grade 6", section: "B" },
];
const allStudents: never[] = [];

describe("AddStudentPage", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("uploads the selected photo first, then includes the returned photoUrl in the create request, and redirects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ photoUrl: "/uploads/students/abc.png" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Student", admissionNo: "SCH-3" }), { status: 201 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStudentPage classes={classes} allStudents={allStudents} />);

    await userEvent.type(screen.getByLabelText("First name"), "New");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-3");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Add parent" }));
    await userEvent.type(screen.getByLabelText("Parent 1 first name"), "A");
    await userEvent.type(screen.getByLabelText("Parent 1 last name"), "Parent");
    await userEvent.type(screen.getByLabelText("Parent 1 mobile number"), "+15550009999");

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Photo"), file);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/students/upload-photo", expect.objectContaining({ method: "POST" }));
    });
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.photoUrl).toBe("/uploads/students/abc.png");
    expect(secondCallBody.rollNumber).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/dashboard/students");
  });

  it("sends every admission field on create", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStudentPage classes={classes} allStudents={allStudents} />);

    await userEvent.type(screen.getByLabelText(/^first name/i), "New");
    await userEvent.type(screen.getByLabelText(/^last name/i), "Student");
    await userEvent.type(screen.getByLabelText(/date of birth/i), "2015-01-01");
    await userEvent.type(screen.getByLabelText(/admission number/i), "NEW-001");
    await userEvent.type(screen.getByLabelText(/^address/i), "12 Example Road");
    await userEvent.type(screen.getByLabelText(/blood group/i), "O+");
    await userEvent.type(screen.getByLabelText(/emergency contact name/i), "Aunt");
    await userEvent.type(screen.getByLabelText(/emergency contact phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/previous school/i), "Little Flower LP");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.address).toBe("12 Example Road");
    expect(body.bloodGroup).toBe("O+");
    expect(body.emergencyContactName).toBe("Aunt");
    expect(body.emergencyContactPhone).toBe("+919876543210");
    expect(body.previousSchool).toBe("Little Flower LP");
  });

  it("offers a third gender option", () => {
    render(<AddStudentPage classes={classes} allStudents={allStudents} />);
    const select = screen.getByLabelText(/gender/i);
    const options = within(select).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(expect.arrayContaining(["male", "female", "other"]));
  });

  it("offers guardian relationship as a fixed list, not free text", async () => {
    render(<AddStudentPage classes={classes} allStudents={allStudents} />);
    await userEvent.click(screen.getByRole("button", { name: /add parent/i }));
    const select = screen.getByLabelText(/relationship/i);
    expect(select.tagName).toBe("SELECT");
    const options = within(select).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(expect.arrayContaining(["father", "mother", "guardian", "grandparent", "sibling", "other"]));
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/add-student-page.test.tsx` → FAIL, module not found.

- [ ] **Step 9: Write `AddStudentPage` and the route**

```tsx
// apps/web/src/components/school-setup/AddStudentPage.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StudentDetailModal, type SaveStudentFields } from "./StudentDetailModal";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

function noop() {}

async function uploadPhoto(file: File): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/students/upload-photo", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json();
    return { ok: false, error: body.error };
  }
  const body = await response.json();
  return { ok: true, photoUrl: body.photoUrl };
}

export function AddStudentPage({
  classes,
  allStudents,
}: {
  classes: { id: number; gradeName: string; section: string }[];
  allStudents: {
    id: number;
    name: string;
    admissionNo: string;
    gender: "male" | "female" | "other" | null;
    class: { gradeName: string; section: string } | null;
  }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function handleSave(fields: SaveStudentFields) {
    setError(null);
    await run(async () => {
      let photoUrl: string | undefined;
      if (fields.photoFile) {
        const uploadResult = await uploadPhoto(fields.photoFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        photoUrl = uploadResult.photoUrl;
      }

      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          dob: fields.dob,
          classId: fields.classId ?? undefined,
          admissionNo: fields.admissionNo,
          rollNumber: fields.rollNumber || undefined,
          photoUrl,
          gender: fields.gender || undefined,
          studentIdNumber: fields.studentIdNumber || undefined,
          dateOfJoin: fields.dateOfJoin || undefined,
          address: fields.address || undefined,
          bloodGroup: fields.bloodGroup || undefined,
          nationality: fields.nationality || undefined,
          religion: fields.religion || undefined,
          previousSchool: fields.previousSchool || undefined,
          emergencyContactName: fields.emergencyContactName || undefined,
          emergencyContactPhone: fields.emergencyContactPhone || undefined,
          category: fields.category || undefined,
          admissionDate: fields.admissionDate || undefined,
          parents: fields.parents.map((p) => ({
            relationship: p.relationship,
            name: `${p.firstName} ${p.lastName}`.trim(),
            phone: p.phone,
            email: p.email || undefined,
          })),
          siblingStudentIds: fields.siblingStudentIds,
        }),
      });
      if (response.status === 201) {
        router.push("/dashboard/students");
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <StudentDetailModal
      mode="create"
      variant="page"
      classes={classes}
      allStudents={allStudents}
      isAdmin={true}
      serverError={error}
      deleteBlocked={false}
      isSubmitting={isSubmitting}
      onClose={noop}
      onSave={handleSave}
      onDelete={noop}
      onDeactivate={noop}
      onCancelDelete={noop}
      onActivate={noop}
    />
  );
}
```

```tsx
// apps/web/src/app/dashboard/students/add/page.tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStudents } from "@/lib/school-setup/students";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { AddStudentPage } from "@/components/school-setup/AddStudentPage";

export default async function AddStudentRoute() {
  const claims = await requireDashboardRole(["admin"]);
  const [students, classes] = await Promise.all([
    listStudents(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <AddStudentPage classes={classes} allStudents={students} />
    </div>
  );
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/add-student-page.test.tsx tests/students-view.test.tsx tests/student-detail-modal.test.tsx` → PASS

- [ ] **Step 11: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` → no errors.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/components/school-setup/StudentDetailModal.tsx apps/web/src/components/school-setup/StudentsView.tsx apps/web/src/components/school-setup/AddStudentPage.tsx apps/web/src/app/dashboard/students/add apps/web/tests/student-detail-modal.test.tsx apps/web/tests/students-view.test.tsx apps/web/tests/add-student-page.test.tsx
git commit -m "feat(students): extract student creation into a dedicated /dashboard/students/add page"
```

---

### Task 14: Rewrite `nav-items.ts` as the nested, role-filtered tree

All hrefs the tree references now exist on disk (13 pre-existing routes + 24 stub routes + 4 new `/add` routes from Tasks 2–13), so the filesystem-existence test can pass immediately.

**Files:**
- Modify: `apps/web/src/lib/dashboard/nav-items.ts` (full rewrite)
- Test: `apps/web/tests/nav-items.test.ts` (full rewrite)

**Interfaces:**
- Produces (consumed by Task 15's `Sidebar.tsx` and Task 16's `layout.tsx`):
  - `export type IconName = ...`
  - `export interface NavChildLeaf { href: string; label: string }` — **no icon**, matching the source mockup where only top-level rows carry one.
  - `export interface NavTopLeaf { href: string; label: string; icon: IconName }`
  - `export interface NavGroup { label: string; icon: IconName; children: NavChildLeaf[] }`
  - `export type NavEntry = NavTopLeaf | NavGroup`
  - `export interface NavSection { label: string; items: NavEntry[] }`
  - `export function getNavSectionsForRole(role: SessionClaims["role"]): NavSection[]`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/nav-items.test.ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getNavSectionsForRole, type NavSection } from "../src/lib/dashboard/nav-items";

function flattenHrefs(sections: NavSection[]): string[] {
  return sections.flatMap((section) =>
    section.items.flatMap((entry) => ("children" in entry ? entry.children.map((c) => c.href) : [entry.href]))
  );
}

describe("getNavSectionsForRole", () => {
  it("points every href at a page.tsx that actually exists on disk", () => {
    const hrefs = flattenHrefs(getNavSectionsForRole("admin"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const pagePath = join(__dirname, "..", "src", "app", ...href.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(pagePath), `${href} -> ${pagePath}`).toBe(true);
    }
  });

  it("gives admin all nine sections, in order", () => {
    const sections = getNavSectionsForRole("admin");
    expect(sections.map((s) => s.label)).toEqual([
      "Main Menu",
      "Academic",
      "People",
      "Progress",
      "Finance",
      "School Management",
      "Communication",
      "Reports",
      "Workspace",
    ]);
  });

  it("gives admin both All Grades and Add Grade under the Grades group", () => {
    const academic = getNavSectionsForRole("admin").find((s) => s.label === "Academic")!;
    const gradesGroup = academic.items.find((entry) => "children" in entry && entry.label === "Grades");
    expect(gradesGroup).toEqual({
      label: "Grades",
      icon: "Layers",
      children: [
        { href: "/dashboard/grades", label: "All Grades" },
        { href: "/dashboard/grades/add", label: "Add Grade" },
      ],
    });
  });

  it("prunes teacher down to Academic > Timetable > Class Timetable only", () => {
    const sections = getNavSectionsForRole("teacher");
    expect(sections.map((s) => s.label)).toEqual([
      "Main Menu",
      "Academic",
      "People",
      "Progress",
      "Communication",
      "Workspace",
    ]);
    const academic = sections.find((s) => s.label === "Academic")!;
    expect(academic.items).toEqual([
      {
        label: "Timetable",
        icon: "CalendarClock",
        children: [{ href: "/dashboard/timetable", label: "Class Timetable" }],
      },
    ]);
  });

  it("prunes teacher's People section down to Students > All Students only", () => {
    const people = getNavSectionsForRole("teacher").find((s) => s.label === "People")!;
    expect(people.items).toEqual([
      {
        label: "Students",
        icon: "GraduationCap",
        children: [{ href: "/dashboard/students", label: "All Students" }],
      },
    ]);
  });

  it("gives accountant only Dashboard, Finance, Communication, and Workspace", () => {
    const sections = getNavSectionsForRole("accountant");
    expect(sections.map((s) => s.label)).toEqual(["Main Menu", "Finance", "Communication", "Workspace"]);
    const finance = sections.find((s) => s.label === "Finance")!;
    expect(finance.items).toEqual([
      {
        label: "Fees",
        icon: "Wallet",
        children: [
          { href: "/dashboard/fees", label: "Fee Structure" },
          { href: "/dashboard/fees", label: "Fee Collection" },
          { href: "/dashboard/fees/payments", label: "Payments" },
          { href: "/dashboard/fees/outstanding", label: "Outstanding Fees" },
        ],
      },
    ]);
  });

  it("returns nothing for parent, who never reaches the dashboard shell", () => {
    expect(getNavSectionsForRole("parent")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/nav-items.test.ts`
Expected: FAIL — `getNavSectionsForRole` is not exported yet.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/dashboard/nav-items.ts
import type { SessionClaims } from "../auth/jwt";

export type IconName =
  | "LayoutDashboard"
  | "Layers"
  | "Building2"
  | "BookMarked"
  | "ScrollText"
  | "Clock"
  | "CalendarClock"
  | "GraduationCap"
  | "Users"
  | "ClipboardCheck"
  | "BookOpen"
  | "Award"
  | "Wallet"
  | "CalendarRange"
  | "TrendingUp"
  | "CalendarDays"
  | "Bell"
  | "FileBarChart"
  | "Settings";

type Role = SessionClaims["role"];

export interface NavChildLeaf {
  href: string;
  label: string;
}

export interface NavTopLeaf {
  href: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  icon: IconName;
  children: NavChildLeaf[];
}

export type NavEntry = NavTopLeaf | NavGroup;

export interface NavSection {
  label: string;
  items: NavEntry[];
}

interface NavChildLeafDef extends NavChildLeaf {
  roles: Role[];
}

interface NavTopLeafDef extends NavTopLeaf {
  roles: Role[];
}

interface NavGroupDef {
  label: string;
  icon: IconName;
  children: NavChildLeafDef[];
}

type NavEntryDef = NavTopLeafDef | NavGroupDef;

interface NavSectionDef {
  label: string;
  items: NavEntryDef[];
}

function isGroupDef(entry: NavEntryDef): entry is NavGroupDef {
  return "children" in entry;
}

function stripChildRoles(leaf: NavChildLeafDef): NavChildLeaf {
  const { roles: _roles, ...rest } = leaf;
  return rest;
}

function stripTopLeafRoles(leaf: NavTopLeafDef): NavTopLeaf {
  const { roles: _roles, ...rest } = leaf;
  return rest;
}

const NAV_TREE: NavSectionDef[] = [
  {
    label: "Main Menu",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: ["teacher", "admin", "accountant"] }],
  },
  {
    label: "Academic",
    items: [
      {
        label: "Grades",
        icon: "Layers",
        children: [
          { href: "/dashboard/grades", label: "All Grades", roles: ["admin"] },
          { href: "/dashboard/grades/add", label: "Add Grade", roles: ["admin"] },
        ],
      },
      {
        label: "Classes",
        icon: "Building2",
        children: [
          { href: "/dashboard/classes", label: "All Classes", roles: ["admin"] },
          { href: "/dashboard/classes/add", label: "Add Class", roles: ["admin"] },
        ],
      },
      {
        label: "Subjects",
        icon: "BookMarked",
        children: [
          { href: "/dashboard/subjects", label: "All Subjects", roles: ["admin"] },
          { href: "/dashboard/subjects/add", label: "Add Subject", roles: ["admin"] },
        ],
      },
      {
        label: "Syllabus",
        icon: "ScrollText",
        children: [
          { href: "/dashboard/syllabus", label: "All Syllabus", roles: ["admin"] },
          { href: "/dashboard/syllabus/add", label: "Add Syllabus", roles: ["admin"] },
        ],
      },
      {
        label: "Periods",
        icon: "Clock",
        children: [{ href: "/dashboard/periods", label: "Period Management", roles: ["admin"] }],
      },
      {
        label: "Timetable",
        icon: "CalendarClock",
        children: [
          { href: "/dashboard/timetable", label: "Class Timetable", roles: ["teacher", "admin"] },
          { href: "/dashboard/timetable/teacher", label: "Teacher Timetable", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Students",
        icon: "GraduationCap",
        children: [
          { href: "/dashboard/students", label: "All Students", roles: ["teacher", "admin"] },
          { href: "/dashboard/students/add", label: "Add Student", roles: ["admin"] },
          { href: "/dashboard/students/admission", label: "Student Admission", roles: ["admin"] },
          { href: "/dashboard/students/change-class", label: "Change Grade/Class", roles: ["admin"] },
          { href: "/dashboard/students/transfer", label: "Student Transfer", roles: ["admin"] },
        ],
      },
      {
        label: "Staff",
        icon: "Users",
        children: [
          { href: "/dashboard/staff", label: "All Staff", roles: ["admin"] },
          { href: "/dashboard/staff/add", label: "Add Staff", roles: ["admin"] },
          { href: "/dashboard/staff/departments", label: "Departments", roles: ["admin"] },
          { href: "/dashboard/staff/designations", label: "Designations", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "Progress",
    items: [
      {
        label: "Attendance",
        icon: "ClipboardCheck",
        children: [
          { href: "/dashboard/attendance", label: "Student Attendance", roles: ["teacher", "admin"] },
          { href: "/dashboard/attendance/staff", label: "Staff Attendance", roles: ["admin"] },
        ],
      },
      {
        label: "Assignments",
        icon: "BookOpen",
        children: [
          { href: "/dashboard/assignments", label: "All Assignments", roles: ["teacher", "admin"] },
          { href: "/dashboard/assignments", label: "Create Assignment", roles: ["teacher", "admin"] },
        ],
      },
      {
        label: "Exams & Marks",
        icon: "Award",
        children: [
          { href: "/dashboard/marks", label: "Exams", roles: ["teacher", "admin"] },
          { href: "/dashboard/marks", label: "Marks", roles: ["teacher", "admin"] },
          { href: "/dashboard/marks/gradebook", label: "Grade Book", roles: ["admin"] },
          { href: "/dashboard/marks/report-cards", label: "Report Cards", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Fees",
        icon: "Wallet",
        children: [
          { href: "/dashboard/fees", label: "Fee Structure", roles: ["admin", "accountant"] },
          { href: "/dashboard/fees", label: "Fee Collection", roles: ["admin", "accountant"] },
          { href: "/dashboard/fees/payments", label: "Payments", roles: ["admin", "accountant"] },
          { href: "/dashboard/fees/outstanding", label: "Outstanding Fees", roles: ["admin", "accountant"] },
        ],
      },
    ],
  },
  {
    label: "School Management",
    items: [
      {
        label: "Academic Years",
        icon: "CalendarRange",
        children: [
          { href: "/dashboard/academic-years", label: "All Academic Years", roles: ["admin"] },
          { href: "/dashboard/academic-years", label: "Add Academic Year", roles: ["admin"] },
        ],
      },
      {
        label: "Promotion",
        icon: "TrendingUp",
        children: [
          { href: "/dashboard/academic-years/promote", label: "Promote Students", roles: ["admin"] },
          { href: "/dashboard/academic-years/promote/history", label: "Promotion History", roles: ["admin"] },
        ],
      },
      { href: "/dashboard/academic-calendar", label: "Academic Calendar", icon: "CalendarDays", roles: ["admin"] },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        label: "Notifications",
        icon: "Bell",
        children: [
          { href: "/dashboard/notifications/announcements", label: "Announcements", roles: ["admin"] },
          { href: "/dashboard/notifications", label: "In-App Notifications", roles: ["teacher", "admin", "accountant"] },
          { href: "/dashboard/notifications/events", label: "Events", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        label: "Reports",
        icon: "FileBarChart",
        children: [
          { href: "/dashboard/reports/students", label: "Student Reports", roles: ["admin"] },
          { href: "/dashboard/reports/academic", label: "Academic Reports", roles: ["admin"] },
          { href: "/dashboard/reports/attendance", label: "Attendance Reports", roles: ["admin"] },
          { href: "/dashboard/reports/staff", label: "Staff Reports", roles: ["admin"] },
          { href: "/dashboard/reports/fees", label: "Fee Reports", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        label: "Settings",
        icon: "Settings",
        children: [
          { href: "/dashboard/settings", label: "School Settings", roles: ["teacher", "admin", "accountant"] },
          { href: "/dashboard/settings/users", label: "Users & Roles", roles: ["admin"] },
          { href: "/dashboard/settings/permissions", label: "Permissions", roles: ["admin"] },
          { href: "/dashboard/settings/system", label: "System Settings", roles: ["admin"] },
        ],
      },
    ],
  },
];

export function getNavSectionsForRole(role: Role): NavSection[] {
  const sections: NavSection[] = [];
  for (const section of NAV_TREE) {
    const items: NavEntry[] = [];
    for (const entry of section.items) {
      if (isGroupDef(entry)) {
        const children = entry.children.filter((child) => child.roles.includes(role)).map(stripChildRoles);
        if (children.length > 0) {
          items.push({ label: entry.label, icon: entry.icon, children });
        }
      } else if (entry.roles.includes(role)) {
        items.push(stripTopLeafRoles(entry));
      }
    }
    if (items.length > 0) {
      sections.push({ label: section.label, items });
    }
  }
  return sections;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/nav-items.test.ts` → PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard/nav-items.ts apps/web/tests/nav-items.test.ts
git commit -m "feat(nav): rewrite nav-items as the nested, role-filtered 9-section tree"
```

---

### Task 15: Rewrite `Sidebar.tsx` to render nested sections with collapsible groups

Children carry no icon of their own (per the mockup). When the whole sidebar is collapsed to its icon rail, a group's children are flattened into icon rows that reuse the **parent group's** icon, since that's the only icon available for them.

**Files:**
- Modify: `apps/web/src/components/dashboard/Sidebar.tsx` (full rewrite)
- Test: `apps/web/tests/sidebar.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `IconName`, `NavSection`, `NavEntry`, `NavGroup`, `NavTopLeaf`, `NavChildLeaf` from `@/lib/dashboard/nav-items` (Task 14).
- Produces: `Sidebar({ sections, pinnedClasses, userName, userInitials, userRole, schoolName, schoolLogoUrl })` — `sections: NavSection[]` replaces the old `navItems`/`workspaceItems` props.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/tests/sidebar.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let mockPathname = "/dashboard/grades";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

import { Sidebar } from "../src/components/dashboard/Sidebar";
import type { NavSection } from "../src/lib/dashboard/nav-items";

const baseSections: NavSection[] = [
  { label: "Main Menu", items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" }] },
];

function renderSidebar(sections: NavSection[] = baseSections) {
  return render(
    <Sidebar
      sections={sections}
      pinnedClasses={[]}
      userName="Jane Admin"
      userInitials="JA"
      userRole="admin"
      schoolName="Test School"
      schoolLogoUrl={null}
    />
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPathname = "/dashboard/grades";
  });
  afterEach(() => cleanup());

  it("renders expanded by default with section headers and nav labels visible", () => {
    renderSidebar();
    expect(screen.getByText("Main Menu")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Jane Admin")).toBeInTheDocument();
  });

  it("collapses to icon-only when the toggle is clicked, hiding labels and section headers", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByText("Main Menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Jane Admin")).not.toBeInTheDocument();
  });

  it("persists the collapsed state to localStorage and restores it on remount", async () => {
    const { unmount } = renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    unmount();

    renderSidebar();
    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("marks a top-level leaf matching the current pathname as active", () => {
    mockPathname = "/dashboard/academic-calendar";
    renderSidebar([
      {
        label: "Main Menu",
        items: [
          { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
          { href: "/dashboard/academic-calendar", label: "Academic Calendar", icon: "CalendarDays" },
        ],
      },
    ]);
    expect(screen.getByRole("link", { name: "Academic Calendar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("does not mark a leaf active when the pathname doesn't match", () => {
    mockPathname = "/dashboard/other";
    renderSidebar([
      { label: "Main Menu", items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" }] },
    ]);
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("renders a group collapsed by default, hiding its children", () => {
    mockPathname = "/dashboard/other";
    renderSidebar([
      {
        label: "Academic",
        items: [
          {
            label: "Timetable",
            icon: "CalendarClock",
            children: [
              { href: "/dashboard/timetable", label: "Class Timetable" },
              { href: "/dashboard/timetable/teacher", label: "Teacher Timetable" },
            ],
          },
        ],
      },
    ]);
    expect(screen.getByRole("button", { name: /Timetable/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Class Timetable")).not.toBeInTheDocument();
  });

  it("expands a group and shows its children when the group button is clicked", async () => {
    mockPathname = "/dashboard/other";
    renderSidebar([
      {
        label: "Academic",
        items: [
          {
            label: "Timetable",
            icon: "CalendarClock",
            children: [{ href: "/dashboard/timetable", label: "Class Timetable" }],
          },
        ],
      },
    ]);
    await userEvent.click(screen.getByRole("button", { name: /Timetable/ }));
    expect(screen.getByRole("link", { name: "Class Timetable" })).toBeInTheDocument();
  });

  it("auto-expands a group whose child matches the current pathname", () => {
    mockPathname = "/dashboard/timetable/teacher";
    renderSidebar([
      {
        label: "Academic",
        items: [
          {
            label: "Timetable",
            icon: "CalendarClock",
            children: [
              { href: "/dashboard/timetable", label: "Class Timetable" },
              { href: "/dashboard/timetable/teacher", label: "Teacher Timetable" },
            ],
          },
        ],
      },
    ]);
    expect(screen.getByRole("link", { name: "Teacher Timetable" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Timetable/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("flattens a group's children into plain icon links (with tooltips) when the sidebar is collapsed", async () => {
    mockPathname = "/dashboard/other";
    renderSidebar([
      {
        label: "Academic",
        items: [
          {
            label: "Timetable",
            icon: "CalendarClock",
            children: [{ href: "/dashboard/timetable", label: "Class Timetable" }],
          },
        ],
      },
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByTitle("Class Timetable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Timetable/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/sidebar.test.tsx`
Expected: FAIL — `Sidebar` doesn't accept a `sections` prop yet.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/components/dashboard/Sidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Layers,
  Building2,
  BookMarked,
  ScrollText,
  Clock,
  CalendarClock,
  GraduationCap,
  Users,
  ClipboardCheck,
  BookOpen,
  Award,
  Wallet,
  CalendarRange,
  TrendingUp,
  CalendarDays,
  Bell,
  FileBarChart,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IconName, NavSection, NavEntry, NavGroup, NavTopLeaf, NavChildLeaf } from "@/lib/dashboard/nav-items";
import { SchoolLogo } from "@/components/SchoolLogo";

const ICON_MAP: Record<IconName, LucideIcon> = {
  LayoutDashboard,
  Layers,
  Building2,
  BookMarked,
  ScrollText,
  Clock,
  CalendarClock,
  GraduationCap,
  Users,
  ClipboardCheck,
  BookOpen,
  Award,
  Wallet,
  CalendarRange,
  TrendingUp,
  CalendarDays,
  Bell,
  FileBarChart,
  Settings,
};

const STORAGE_KEY = "sidebar-collapsed";

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

function flattenHrefs(items: NavEntry[]): string[] {
  return items.flatMap((entry) => (isGroup(entry) ? entry.children.map((c) => c.href) : [entry.href]));
}

export function Sidebar({
  sections,
  pinnedClasses,
  userName,
  userInitials,
  userRole,
  schoolName,
  schoolLogoUrl,
}: {
  sections: NavSection[];
  pinnedClasses: { id: number; gradeName: string; section: string }[];
  userName: string;
  userInitials: string;
  userRole: string;
  schoolName: string;
  schoolLogoUrl: string | null;
}) {
  const pathname = usePathname();

  // Among all leaf hrefs (including those nested inside groups), the "active"
  // one is the longest href that either exactly matches the current pathname
  // or is a parent route of it -- the longest match wins so a shorter parent
  // route like "/dashboard" isn't marked active alongside a more specific
  // child route like "/dashboard/grades".
  const allHrefs = sections.flatMap((section) => flattenHrefs(section.items));
  const activeHref = allHrefs
    .filter((href) => pathname === href || (pathname?.startsWith(`${href}/`) ?? false))
    .sort((a, b) => b.length - a.length)[0];

  function isActive(href: string): boolean {
    return href === activeHref;
  }

  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const section of sections) {
      for (const entry of section.items) {
        if (isGroup(entry) && entry.children.some((child) => child.href === activeHref)) {
          initial.add(`${section.label}:${entry.label}`);
        }
      }
    }
    return initial;
  });

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function navLinkClass(active: boolean): string {
    return `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
      active
        ? "bg-indigo-50 text-indigo-700"
        : "text-neutral-500 hover:bg-[#EAECF0]/30 hover:text-neutral-800"
    }`;
  }

  function renderTopLeaf(item: NavTopLeaf) {
    const Icon = ICON_MAP[item.icon];
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={navLinkClass(active)}
          title={collapsed ? item.label : undefined}
          aria-current={active ? "page" : undefined}
        >
          <Icon className={`h-4 w-4 shrink-0 ${active ? "text-indigo-600" : "text-neutral-400"}`} />
          {!collapsed && <span>{item.label}</span>}
        </Link>
      </li>
    );
  }

  // Children carry no icon of their own (the source mockup only puts an icon
  // on the top-level row). When the sidebar is collapsed to its icon rail, a
  // flattened child still needs *some* icon, so it borrows its parent
  // group's -- see the two call sites below.
  function renderChild(item: NavChildLeaf, groupIcon: IconName) {
    const Icon = ICON_MAP[groupIcon];
    const active = isActive(item.href);
    return (
      <li key={`${item.href}:${item.label}`}>
        <Link
          href={item.href}
          className={`${navLinkClass(active)} ${collapsed ? "" : "pl-8"}`}
          title={collapsed ? item.label : undefined}
          aria-current={active ? "page" : undefined}
        >
          {collapsed && <Icon className={`h-4 w-4 shrink-0 ${active ? "text-indigo-600" : "text-neutral-400"}`} />}
          {!collapsed && <span>{item.label}</span>}
        </Link>
      </li>
    );
  }

  function renderGroup(sectionLabel: string, group: NavGroup) {
    const key = `${sectionLabel}:${group.label}`;
    const expanded = expandedGroups.has(key);
    const Icon = ICON_MAP[group.icon];
    const groupActive = group.children.some((child) => isActive(child.href));
    return (
      <li key={key}>
        <button
          type="button"
          onClick={() => toggleGroup(key)}
          aria-expanded={expanded}
          className={`${navLinkClass(groupActive && !expanded)} w-full justify-between`}
        >
          <span className="flex items-center gap-2.5">
            <Icon className={`h-4 w-4 shrink-0 ${groupActive ? "text-indigo-600" : "text-neutral-400"}`} />
            <span>{group.label}</span>
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        {expanded && (
          <ul className="mt-0.5 space-y-0.5">
            {group.children.map((child) => renderChild(child, group.icon))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <aside
      className={`flex shrink-0 flex-col justify-between border-r border-neutral-200/70 bg-neutral-50/95 transition-all ${
        collapsed ? "w-16" : "w-[260px]"
      }`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <SchoolLogo logoUrl={schoolLogoUrl} schoolName={schoolName} className="h-7 w-7" />
            {!collapsed && (
              <div>
                <p className="truncate text-sm font-semibold tracking-tight text-neutral-900">{schoolName}</p>
                <p className="text-[10px] font-medium text-neutral-400">School Workspace</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-1">
        {sections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((entry) =>
                isGroup(entry)
                  ? collapsed
                    ? entry.children.map((child) => renderChild(child, entry.icon))
                    : renderGroup(section.label, entry)
                  : renderTopLeaf(entry)
              )}
            </ul>
          </div>
        ))}

        {pinnedClasses.length > 0 && (
          <div>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Pinned Classes
              </p>
            )}
            <ul className="space-y-0.5">
              {pinnedClasses.map((klass) => (
                <li key={klass.id}>
                  <Link
                    href="/dashboard/classes"
                    className={navLinkClass(false)}
                    title={collapsed ? `${klass.gradeName} ${klass.section}` : undefined}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-600">
                      {klass.gradeName[0]}
                    </span>
                    {!collapsed && (
                      <span className="truncate">
                        {klass.gradeName} {klass.section}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200/40 bg-neutral-100/60 p-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6] text-xs font-bold text-white">
            {userInitials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs font-semibold text-neutral-800">{userName}</p>
              <p className="truncate text-[9px] capitalize text-neutral-400">{userRole}</p>
            </div>
          )}
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            {collapsed ? "⏻" : "Logout"}
          </button>
        </form>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/sidebar.test.tsx` → PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/Sidebar.tsx apps/web/tests/sidebar.test.tsx
git commit -m "feat(nav): render nested nav sections with collapsible groups in Sidebar"
```

---

### Task 16: Wire the new nav into the dashboard layout, and verify in the browser

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `getNavSectionsForRole` from Task 14, `sections` prop from Task 15.

- [ ] **Step 1: Update the layout**

```tsx
// apps/web/src/app/dashboard/layout.tsx — before
import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getNavItemsForRole, WORKSPACE_NAV_ITEMS } from "@/lib/dashboard/nav-items";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { Sidebar } from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = await requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: claims.schoolId } });
  const navItems = getNavItemsForRole(claims.role);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
```

```tsx
// after
import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getNavSectionsForRole } from "@/lib/dashboard/nav-items";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { Sidebar } from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = await requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: claims.schoolId } });
  const sections = getNavSectionsForRole(claims.role);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
```

And the `Sidebar` render call:

```tsx
// before
      <Sidebar
        navItems={navItems}
        workspaceItems={WORKSPACE_NAV_ITEMS}
        pinnedClasses={pinnedClasses}
        userName={user.name}
        userInitials={initials}
        userRole={claims.role}
        schoolName={school.name}
        schoolLogoUrl={school.logoUrl}
      />
// after
      <Sidebar
        sections={sections}
        pinnedClasses={pinnedClasses}
        userName={user.name}
        userInitials={initials}
        userRole={claims.role}
        schoolName={school.name}
        schoolLogoUrl={school.logoUrl}
      />
```

(The rest of the file — the `pinnedClasses` computation, `initials`, and the `<header>`/`<main>` markup — is unchanged.)

- [ ] **Step 2: Run the full web test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS across the board — every test file touched in Tasks 1–16, plus no regressions in untouched suites.

- [ ] **Step 3: Typecheck the whole app**

Run: `cd apps/web && npx tsc --noEmit` → no errors.

- [ ] **Step 4: Manual browser verification**

Start the dev server and, logged in as each role, confirm:
- **admin** sees all 9 sections (Main Menu, Academic, People, Progress, Finance, School Management, Communication, Reports, Workspace); every group expands/collapses; every link resolves — the 27 stub links show "Coming soon", `+ Create Grade` / `+ Create Class` / `Add new staff` / `Add new student` each land on a real dedicated add page (no modal pops up), and creating a record from that page redirects back to its list.
- **teacher** sees only Main Menu, Academic (Timetable group with just Class Timetable), People (Students group with just All Students), Progress (Attendance/Assignments/Exams & Marks, each pruned to teacher-visible children), Communication, Workspace.
- **accountant** sees only Main Menu, Finance (Fees group, all 4 children), Communication, Workspace.
- Collapsing the sidebar rail still shows an icon for every row (group children reuse their parent's icon), and every icon-only link has a hover tooltip with its label.
- Navigating directly to a nested stub route (e.g. `/dashboard/timetable/teacher`) auto-expands its parent group in the sidebar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(nav): wire role-filtered nav sections into the dashboard layout"
```

---

## Self-Review

**Spec coverage:**
- Corrected 9-section menu structure, exactly as approved (naming, dedup, `Change Grade/Class`, `Progress` rename, unique top-level icons) — Task 14's `NAV_TREE`. ✅
- `NavItem` → `NavChildLeaf`/`NavTopLeaf`/`NavGroup`/`NavSection` data model, no icons on children — Task 14. ✅
- Per-leaf role filtering verified against every existing page's actual `requireDashboardRole` call — Task 14, cross-checked in the spec's Role Visibility table. ✅
- `Sidebar` renders/expands/collapses nested groups, flattening to parent-icon rows when collapsed — Task 15. ✅
- No dead links for stub items — Tasks 2–9 (`ComingSoonPage` + 27 stub routes) + Task 14's filesystem-existence test. ✅
- `Add Grade`/`Add Class`/`Add Staff`/`Add Student` become dedicated pages instead of modals — Tasks 10–13, with `Add Academic Year`/`Create Assignment` correctly left untouched (they were never modals). ✅
- Layout wiring — Task 16. ✅

**Placeholder scan:** No "TBD"/"similar to Task N"/unshown code. Where a diff shows only the changed anchor lines (e.g. `StaffDetailModal`'s ~200 unchanged middle lines), the plan says explicitly what stays the same and why, rather than omitting it silently. ✅

**Type consistency:** `NavChildLeaf { href, label }`, `NavTopLeaf { href, label, icon }`, `NavGroup { label, icon, children: NavChildLeaf[] }`, `NavSection { label, items: NavEntry[] }`, and `getNavSectionsForRole(role): NavSection[]` are defined once in Task 14 and consumed with the same shape in Task 15's `Sidebar` and its tests, and Task 16's `layout.tsx`. `StaffDetailModal`/`StudentDetailModal`'s new `variant?: "modal" | "page"` prop is defined once (Tasks 12–13) and used identically by `AddStaffPage`/`AddStudentPage`. ✅

**Cascading-change check:** Task 11 traces `ClassesView`'s `grades` prop all the way through to its only two other call sites (`classes/page.tsx`, `classes-view.test.tsx`) instead of leaving a dangling unused prop. ✅

