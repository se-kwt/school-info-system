# Web Dashboard: Staff Login & Shell — Design Spec

Status: Approved — 2026-07-05

## 1. Scope

This is the first of several sub-projects building the staff-facing web dashboard (Teacher/Admin/Accountant), following the Foundation plan (schema, OTP auth, RBAC — already merged to `main`).

This sub-project builds exactly two things:
1. A phone+OTP login screen for staff (Teacher, Admin, Accountant).
2. The role-scoped dashboard shell: sidebar navigation, layout, and "coming soon" placeholder pages for each feature area.

It does **not** build any real Attendance, Assignments, Marks, Timetable, Students, or Fees logic — each of those is a separate follow-on spec, built and shipped independently once this shell exists.

## 2. Architecture

**Session handling:** The existing `/api/auth/verify-otp` endpoint (built in Foundation) returns the session JWT in its JSON response body — fine for an API consumer, but not for a browser-based login flow. This sub-project adds a new route, `/api/auth/session`, which internally calls the existing `verifyOtp` function and, on success, sets the JWT as an HttpOnly, Secure, `SameSite=Lax` cookie named `session` instead of returning it in the body. The browser never has JS-readable access to the token, which protects against XSS-based token theft. The login page calls `/api/auth/session`, not `/api/auth/verify-otp` directly.

**Route protection:** Protection happens in a Next.js Server Component layout at `app/dashboard/layout.tsx`. It reads the `session` cookie via `next/headers`, calls the existing `verifySessionToken`, then `requireRole` (from Foundation) with all three staff roles (`teacher`, `admin`, `accountant`) — redirecting to `/login` if the cookie is missing, invalid, or the role isn't one of the three. This deliberately does not use Next.js Edge Middleware: `jsonwebtoken` depends on Node's `crypto` module, which isn't available in the Edge runtime, so Middleware would require a second, edge-compatible JWT library (e.g. `jose`) purely for this check — introducing a second, unverified code path to re-implement logic Foundation already built and tested. A Server Component layout runs in the Node.js runtime by default and can reuse the exact tested functions directly.

**Per-page role enforcement:** Beyond the layout's "is this any valid staff session" check, each individual dashboard page (including placeholders) independently re-verifies the session cookie and calls `requireRole` with that page's specific allowed roles (see table in section 4). This is a deliberate, small duplication of the cookie read/verify step — chosen over building a React Context mechanism to pass the verified role down from the layout, since that machinery is premature for 7 simple pages. If a page's role check fails, it redirects to `/dashboard` (no error page, no flash message — simplest behavior since there's no sensitive data being hidden behind placeholders yet).

**Logout:** `/api/auth/logout` (a new route) clears the `session` cookie and redirects to `/login`.

**Data flow summary:** Login page → `/api/auth/session` (wraps send-otp/verify-otp) → sets `session` cookie → browser navigates to `/dashboard` → layout reads cookie server-side, verifies staff role → renders sidebar filtered to that role → each page independently re-verifies its own allowed roles.

## 3. Login Screen (`/login`)

A single route, client component, two-step local state (no navigation between steps):

**Step 1 — Phone entry:**
- Single phone-number text input + "Send code" button.
- On submit: `POST /api/auth/send-otp` with `{ phone }`.
- On success (`200`): advance to Step 2.
- On `404` (`PHONE_NOT_REGISTERED` → "Phone number is not registered"): show this message inline, stay on Step 1.
- On `400` (missing/empty phone): show "Enter a phone number," stay on Step 1.

**Step 2 — OTP entry:**
- 6-digit code text input + "Verify" button + a "Change number" link (returns to Step 1, clearing any entered code).
- On submit: `POST /api/auth/session` with `{ phone, code }`.
- On success (`200`, cookie set): navigate to `/dashboard`.
- On `401` (`INVALID_CODE` / `EXPIRED` / `NOT_FOUND` — all three map to the same generic user-facing message, since the existing `verifyOtp` function's error enum doesn't need to be exposed to distinguish these for the user): show "Incorrect or expired code. Try again," stay on Step 2, allow resubmission without resending.
- On `400` (missing phone/code): show "Enter the code," stay on Step 2.

## 4. Dashboard Shell (`/dashboard/*`)

**Layout (`app/dashboard/layout.tsx`):**
- Left sidebar, top-to-bottom: Dashboard, Students, Attendance, Assignments, Exams & Marks, Timetable, Fees, then a Logout button pinned to the bottom.
- Nav items filtered via a pure helper function `getNavItemsForRole(role): NavItem[]`:
  - **teacher:** Dashboard, Students, Attendance, Assignments, Exams & Marks, Timetable
  - **admin:** Dashboard, Students, Attendance, Assignments, Exams & Marks, Timetable, Fees (all)
  - **accountant:** Dashboard, Fees (only)
- Top-right corner shows the logged-in user's name and role (from the layout's verified session).

**Pages and their per-page allowed roles:**

| Route | Allowed roles | Content |
|---|---|---|
| `/dashboard` | teacher, admin, accountant | "Welcome, {name} ({role})" — no widgets yet |
| `/dashboard/students` | teacher, admin | `<ComingSoon feature="Students" />` |
| `/dashboard/attendance` | teacher, admin | `<ComingSoon feature="Attendance" />` |
| `/dashboard/assignments` | teacher, admin | `<ComingSoon feature="Assignments" />` |
| `/dashboard/marks` | teacher, admin | `<ComingSoon feature="Exams & Marks" />` |
| `/dashboard/timetable` | teacher, admin | `<ComingSoon feature="Timetable" />` |
| `/dashboard/fees` | admin, accountant | `<ComingSoon feature="Fees" />` |

`<ComingSoon feature="...">` is a small shared presentational component (e.g., "Attendance — coming soon").

## 5. Styling

Tailwind CSS only — no component library. Install and configure Tailwind for `apps/web`. The login screen uses plain HTML form elements styled with Tailwind utility classes; the dashboard shell uses a simple flexbox layout (fixed-width sidebar + flexible content area). No `shadcn/ui` or other component library for this sub-project — revisit if/when later feature sub-projects (data tables, complex forms) make the case for one.

## 6. Testing

Consistent with how Foundation was tested — Vitest unit tests for pure logic, not full browser/E2E tests:
- `getNavItemsForRole(role)` — one test per role, asserting the exact nav item list.
- `/api/auth/session` route — a test that mocks a successful `verifyOtp` result and asserts the response sets a `Set-Cookie` header with the expected name/flags (`HttpOnly`, `Secure`, `SameSite=Lax`), and a test that a failed `verifyOtp` result returns 401 with no cookie set.
- Per-page role checks are simple, repeated applications of the already-tested `requireRole` function — not re-tested per page beyond one representative test confirming the redirect-on-disallowed-role behavior, to avoid seven near-identical tests.

## 7. Out of Scope (explicitly deferred)

- Any real Attendance/Assignments/Marks/Timetable/Students/Fees data or logic — placeholders only.
- Parent mobile app (separate sub-project).
- Real SMS/WhatsApp delivery (still `ConsoleSmsSender` from Foundation).
- Any dashboard widgets, charts, or summary data on `/dashboard` itself.
