# Parent Login & Home — Design Spec

Status: Approved — 2026-07-10

## 1. Problem

The web app currently only serves staff (teacher/admin/accountant). The `parent` role already exists end-to-end in the data model and OTP auth pipeline (`User.role`, `ParentStudent`, `send-otp`, `verify-otp`, JWT session), but there is no way for a parent to actually reach anything after logging in: the login page is hardcoded "Staff Login" and always redirects to `/dashboard`, and `requireDashboardRole` explicitly blocks the `parent` role from every `/dashboard/*` route. `NAV_HREFS_BY_ROLE.parent` is already `[]`.

This spec covers making parent login work end-to-end on the web app, landing on a minimal read-only parent home page. Mobile app, tap-through to full module views, and notifications are out of scope — deferred to future work.

## 2. Scope

**In scope**
- Shared `/login` page works for both staff and parent phone numbers, redirecting to the correct area post-verification.
- A parent-only `/parent` route: header (name, logout), child-switcher for multi-child parents, and four read-only summary cards (attendance, assignments, marks, fees) for the selected child.
- Route protection so only `role: "parent"` sessions can reach `/parent`, mirroring how `requireDashboardRole` blocks staff routes from parents.

**Out of scope**
- Mobile app (React Native) — future project, per the original system design.
- Tap-through from a summary card into a full module view (e.g. full attendance calendar, full assignment list) — future task.
- Notifications, push, SMS alerts.
- Any change to the OTP send/verify security posture (rate limiting, enumeration hardening) — tracked separately in the foundation spec's follow-ups list, unrelated to this feature.

## 3. Auth Flow Changes

The OTP pipeline (`sendOtp`, `verifyOtp`, `signSessionToken`/`verifySessionToken`, session cookie, logout) is role-agnostic already and requires **no changes** — a `User` row with `role: "parent"` already authenticates correctly and gets a valid session cookie with `role: "parent"` in its claims.

Two small changes are needed:

1. **`POST /api/auth/session`** — currently returns `{ success: true }`. Add the verified user's `role` to the response body: `{ success: true, role }`. The client needs this to decide where to redirect (there is no client-side way to read the httpOnly session cookie).
2. **`/login` page** — rename the heading from "Staff Login" to "Log in" (it now serves both audiences with the same phone+OTP form). On successful verification, branch on the returned `role`: `parent` → `router.push("/parent")`, anything else (`teacher`/`admin`/`accountant`) → `router.push("/dashboard")`.

No changes to `send-otp`, `verify-otp` business logic, `jwt.ts`, or `session-cookie.ts`.

## 4. Route Protection

New file `src/lib/auth/require-parent-role.ts`, mirroring the shape of `require-dashboard-role.ts`:

```ts
export function requireParentRole(): SessionClaims {
  const claims = verifySessionCookie(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!claims || claims.role !== "parent") {
    redirect("/login");
  }
  return claims;
}
```

A staff session hitting `/parent` gets redirected to `/login` (not `/dashboard`) — consistent with how a parent session hitting `/dashboard` is redirected to `/login`, not `/parent`. Neither role auto-redirects into the other's area; both funnel through the shared login page, which then routes based on the fresh session's role.

## 5. Data Layer

New file `src/lib/parent/overview.ts`:

- `getParentChildren(prisma, parentUserId)` — thin re-export/wrapper around the existing `getStudentsForParent` from `scoped-queries.ts` (already returns all `Student` rows linked via `ParentStudent`).
- `getParentOverview(prisma, params: { studentId: number, schoolId: number })` → `ParentOverview`:
  - `attendanceMonthPercent: number` — current calendar month `Attendance` rows for the student; percent of `present`/`late` out of total marked days (same formula as `attendancePercent()` in `dashboard/overview.ts`). `0` if no records this month.
  - `upcomingAssignments: { id, subject, title, dueDate, status }[]` — up to 3 `AssignmentStatus` rows for the student where `status === "pending"` (via `displayStatus` to fold in overdue), ordered by `dueDate` ascending, joined to `Assignment` for subject/title/dueDate.
  - `latestExam: { examName, term, subjects: { subject, marksObtained, maxMarks, grade }[] } | null` — the most recent `Exam` (by `examDate`) that has at least one `Mark` row for this student, with all subject marks for that exam.
  - `feesOutstanding: { amount: number, nearestDueDate: string | null }` — sum across all `FeeStructure` rows for the student's current class (`amount - amountPaid`, floored at 0 per structure, using the same `computeFeeStatus`-adjacent logic as `fee-payments.ts`), plus the nearest unpaid/partial structure's `dueDate`.

This module queries directly by `studentId` rather than reusing the class-scoped roster functions in `attendance.ts`/`marks.ts`/`assignments.ts`/`fee-payments.ts`, since those are built for a teacher/admin marking a whole class and would require extra scoping checks that don't apply to a parent reading their own linked child's data. A parent's access is authorized entirely by the existence of a `ParentStudent` row for `(parentUserId, studentId)` — every query in this module must filter through that link (either by taking a pre-validated `studentId` after checking it belongs to the parent, or via a join), never by `studentId` alone.

## 6. UI

**`src/app/parent/layout.tsx`** — minimal shell, no sidebar (parent has one page, unlike staff's multi-section dashboard):
- Header row: school name (from `claims.schoolId` → `School.name`), parent's name + initials avatar, logout button (posts to existing `/api/auth/logout`).
- `requireParentRole()` call at the top, same pattern as `DashboardLayout`.

**`src/app/parent/page.tsx`** — server component, reads `?studentId=` search param:
- Calls `getParentChildren` for the logged-in parent. If none linked, show an empty state ("No students linked to this account — contact the school office").
- Resolves the active child: `studentId` param if it belongs to this parent's children, else the first child.
- Child-switcher: row of chips (child name, initials avatar) — **only rendered if the parent has more than one child** — clicking a chip navigates to `/parent?studentId=<id>`.
- Calls `getParentOverview` for the active child, renders 4 cards in a responsive grid using the existing `KpiCard` visual language (rounded-2xl white card, icon chip, bold value, label):
  - **Attendance** — `{monthPercent}%` this month.
  - **Assignments** — count of pending, with up to 3 listed below (title, subject, due date, overdue in red).
  - **Marks** — latest exam name + subject/grade breakdown, or "No exams recorded yet".
  - **Fees** — outstanding amount, nearest due date, or "No dues" in green if `amount === 0`.

Color coding follows the existing system convention: green = good/paid, amber = due soon, red = overdue/absent.

## 7. Testing

Following the existing test suite's per-unit style (`tests/*.test.ts(x)`):
- `require-parent-role.test.ts` — parent session passes; staff/no session redirects to `/login`.
- `parent-overview.test.ts` — `getParentOverview` computes each of the 4 sections correctly against seeded fixtures (attendance %, pending assignments ordering, latest exam selection, fee outstanding sum).
- `login-page.test.tsx` — update existing test to cover the role-based redirect branch (parent → `/parent`, staff roles → `/dashboard`).
- `session-route.test.ts` — update to assert `role` is present in the response body.
- Component test for the parent page/cards rendering (child-switcher visibility toggle, empty states).

## 8. Risks & Follow-ups

- **Parent with zero linked children** — handled as an explicit empty state rather than an error; can happen if admin hasn't yet linked the parent to a student record.
- **`studentId` param tampering** — a parent could pass another school's/parent's `studentId` in the URL; `getParentOverview` must only ever be called after confirming the `studentId` is in that parent's `getParentChildren` result, never trust the param directly.
- Tap-through from cards to full module views, mobile app, and notification delivery remain explicitly deferred, per section 2.
