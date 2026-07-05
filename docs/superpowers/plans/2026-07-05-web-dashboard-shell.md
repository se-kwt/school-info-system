# Web Dashboard: Staff Login & Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the staff phone+OTP login screen and the role-scoped dashboard shell (sidebar nav + layout + placeholder pages) on top of the already-merged Foundation (schema, OTP auth, RBAC).

**Architecture:** A new `/api/auth/session` route wraps the existing `verifyOtp` function and sets the session JWT as an HttpOnly cookie (instead of returning it in the JSON body, as `verify-otp` does). A shared `requireDashboardRole(allowedRoles)` function reads and verifies that cookie and enforces per-page role checks, reused by both `app/dashboard/layout.tsx` and every individual dashboard page. The login page is a client component with local two-step state (phone → OTP), calling `send-otp` and the new `session` route via `fetch`.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS v3 (new), Vitest (existing) + `@testing-library/react`/`jsdom` (new, for the login page component test), reusing Foundation's `verifySessionToken`, `verifyOtp`, `sendOtp`, `prisma` client.

## Global Constraints

- Session cookie name is exactly `session`; set as `HttpOnly`, `Secure`, `SameSite=Lax`, `path=/`, 30-day `maxAge` (per spec section 2).
- Staff roles allowed to log in and hold a dashboard session: `teacher`, `admin`, `accountant` (not `parent`) (per spec sections 2, 4).
- Per-page allowed roles are exactly (per spec section 4):
  - `/dashboard`: teacher, admin, accountant
  - `/dashboard/students`: teacher, admin
  - `/dashboard/attendance`: teacher, admin
  - `/dashboard/assignments`: teacher, admin
  - `/dashboard/marks`: teacher, admin
  - `/dashboard/timetable`: teacher, admin
  - `/dashboard/fees`: admin, accountant
- On a disallowed role, redirect to `/dashboard`; on no/invalid session, redirect to `/login` (per spec sections 2, 4).
- No Next.js Edge Middleware for auth — checks happen in Server Components/Route Handlers reusing Foundation's `verifySessionToken`/`requireRole` (per spec section 2).
- Styling is Tailwind CSS utility classes only — no component library (per spec section 5).
- No real Attendance/Assignments/Marks/Timetable/Students/Fees logic — placeholder pages only (per spec section 7).

---

### Task 1: Install and configure Tailwind CSS

**Files:**
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Produces: Tailwind utility classes available to every component under `apps/web/src`.

- [ ] **Step 1: Install Tailwind and its PostCSS dependencies**

```bash
cd apps/web
npm install --save-dev tailwindcss@3.4.14 postcss@8.4.49 autoprefixer@10.4.20
```

- [ ] **Step 2: Write the Tailwind config**

`apps/web/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Write the PostCSS config**

`apps/web/postcss.config.js`:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Write the global stylesheet**

`apps/web/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Import the stylesheet in the root layout**

Replace the full contents of `apps/web/src/app/layout.tsx`:

```tsx
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Leave `apps/web/src/app/page.tsx` (the root `/` placeholder page) unchanged — it is out of scope for this sub-project.

- [ ] **Step 6: Verify the app still builds with Tailwind wired in**

```bash
npx next build
```

Expected: build completes successfully with no errors (warnings about lint/telemetry are fine).

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/web/tailwind.config.ts apps/web/postcss.config.js apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/package.json apps/web/package-lock.json
git commit -m "Install and configure Tailwind CSS"
```

---

### Task 2: Session cookie verification helper

**Files:**
- Create: `apps/web/src/lib/auth/session-cookie.ts`
- Test: `apps/web/tests/session-cookie.test.ts`

**Interfaces:**
- Consumes: `verifySessionToken`, `SessionClaims` from `apps/web/src/lib/auth/jwt.ts` (already exists from Foundation).
- Produces: `SESSION_COOKIE_NAME = "session"` and `verifySessionCookie(cookieValue: string | undefined): SessionClaims | null` — used by Task 3 (session route), Task 4 is unaffected, and Task 6 (`requireDashboardRole`).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/session-cookie.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { verifySessionCookie } from "../src/lib/auth/session-cookie";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("verifySessionCookie", () => {
  it("returns claims for a valid cookie value", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    const claims = verifySessionCookie(token);
    expect(claims).toEqual(
      expect.objectContaining({ userId: 1, role: "teacher", schoolId: 1 })
    );
  });

  it("returns null for an undefined cookie value", () => {
    expect(verifySessionCookie(undefined)).toBeNull();
  });

  it("returns null for an invalid or tampered token", () => {
    expect(verifySessionCookie("not-a-real-token")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/session-cookie.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/auth/session-cookie'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/auth/session-cookie.ts`:

```ts
import { verifySessionToken, type SessionClaims } from "./jwt";

export const SESSION_COOKIE_NAME = "session";

export function verifySessionCookie(cookieValue: string | undefined): SessionClaims | null {
  if (!cookieValue) return null;
  try {
    return verifySessionToken(cookieValue);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/session-cookie.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/lib/auth/session-cookie.ts apps/web/tests/session-cookie.test.ts
git commit -m "Add session cookie verification helper"
```

---

### Task 3: `/api/auth/session` route (cookie-setting login)

**Files:**
- Create: `apps/web/src/app/api/auth/session/route.ts`
- Test: `apps/web/tests/session-route.test.ts`

**Interfaces:**
- Consumes: `verifyOtp` from `apps/web/src/lib/auth/verify-otp.ts`, `prisma` from `apps/web/src/lib/prisma.ts`, `SESSION_COOKIE_NAME` from `apps/web/src/lib/auth/session-cookie.ts` (Task 2).
- Produces: `POST` handler exported from this route — consumed by the login page (Task 8) via `fetch("/api/auth/session")`.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/session-route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { sendOtp } from "../src/lib/auth/send-otp";
import { POST as sessionRoute } from "../src/app/api/auth/session/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session-cookie";
import type { SmsSender } from "../src/lib/auth/sms-sender";

class FakeSmsSender implements SmsSender {
  public lastMessage = "";
  async send(_phone: string, message: string): Promise<void> {
    this.lastMessage = message;
  }
}

function extractCode(message: string): string {
  const match = message.match(/\d{6}/);
  if (!match) throw new Error("no code found in message");
  return match[0];
}

describe("POST /api/auth/session", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("sets an HttpOnly session cookie for a correct, unexpired code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550006666", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550006666", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ phone: "+15550006666", code }),
      headers: { "content-type": "application/json" },
    });

    const response = await sessionRoute(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("returns 401 with no cookie for an incorrect code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550007777", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550007777", { prisma, smsSender });

    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ phone: "+15550007777", code: "000000" }),
      headers: { "content-type": "application/json" },
    });

    const response = await sessionRoute(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 for a malformed request body", async () => {
    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    const response = await sessionRoute(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/session-route.test.ts
```

Expected: FAIL with `Cannot find module '../src/app/api/auth/session/route'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/auth/session/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/auth/verify-otp";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function POST(request: Request) {
  let phone: string | undefined;
  let code: string | undefined;
  try {
    ({ phone, code } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!phone || !code) {
    return NextResponse.json({ error: "phone and code are required" }, { status: 400 });
  }

  const result = await verifyOtp(phone, code, { prisma });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/session-route.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/app/api/auth/session apps/web/tests/session-route.test.ts
git commit -m "Add cookie-setting session login route"
```

---

### Task 4: `/api/auth/logout` route

**Files:**
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Test: `apps/web/tests/logout-route.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE_NAME` from `apps/web/src/lib/auth/session-cookie.ts` (Task 2).
- Produces: `POST` handler exported from this route — consumed by the dashboard layout's logout form (Task 6).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/logout-route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { POST as logoutRoute } from "../src/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session-cookie";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and redirects to /login", async () => {
    const request = new Request("http://localhost/api/auth/logout", { method: "POST" });
    const response = await logoutRoute(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
    expect(setCookie).toContain("Max-Age=0");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/logout-route.test.ts
```

Expected: FAIL with `Cannot find module '../src/app/api/auth/logout/route'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/logout-route.test.ts
```

Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/app/api/auth/logout apps/web/tests/logout-route.test.ts
git commit -m "Add logout route that clears the session cookie"
```

---

### Task 5: Role-scoped navigation items

**Files:**
- Create: `apps/web/src/lib/dashboard/nav-items.ts`
- Test: `apps/web/tests/nav-items.test.ts`

**Interfaces:**
- Consumes: `SessionClaims` type from `apps/web/src/lib/auth/jwt.ts` (Foundation).
- Produces: `NavItem { href: string; label: string }`, `getNavItemsForRole(role: SessionClaims["role"]): NavItem[]` — used by Task 6 (dashboard layout).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/nav-items.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getNavItemsForRole } from "../src/lib/dashboard/nav-items";

describe("getNavItemsForRole", () => {
  it("returns six items for teacher, excluding Fees", () => {
    const items = getNavItemsForRole("teacher");
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/students",
      "/dashboard/attendance",
      "/dashboard/assignments",
      "/dashboard/marks",
      "/dashboard/timetable",
    ]);
  });

  it("returns all seven items for admin", () => {
    const items = getNavItemsForRole("admin");
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/students",
      "/dashboard/attendance",
      "/dashboard/assignments",
      "/dashboard/marks",
      "/dashboard/timetable",
      "/dashboard/fees",
    ]);
  });

  it("returns only Dashboard and Fees for accountant", () => {
    const items = getNavItemsForRole("accountant");
    expect(items.map((item) => item.href)).toEqual(["/dashboard", "/dashboard/fees"]);
  });

  it("returns an empty list for parent", () => {
    expect(getNavItemsForRole("parent")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/nav-items.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/dashboard/nav-items'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/dashboard/nav-items.ts`:

```ts
import type { SessionClaims } from "../auth/jwt";

export interface NavItem {
  href: string;
  label: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/students", label: "Students" },
  { href: "/dashboard/attendance", label: "Attendance" },
  { href: "/dashboard/assignments", label: "Assignments" },
  { href: "/dashboard/marks", label: "Exams & Marks" },
  { href: "/dashboard/timetable", label: "Timetable" },
  { href: "/dashboard/fees", label: "Fees" },
];

const NAV_HREFS_BY_ROLE: Record<SessionClaims["role"], string[]> = {
  teacher: [
    "/dashboard",
    "/dashboard/students",
    "/dashboard/attendance",
    "/dashboard/assignments",
    "/dashboard/marks",
    "/dashboard/timetable",
  ],
  admin: [
    "/dashboard",
    "/dashboard/students",
    "/dashboard/attendance",
    "/dashboard/assignments",
    "/dashboard/marks",
    "/dashboard/timetable",
    "/dashboard/fees",
  ],
  accountant: ["/dashboard", "/dashboard/fees"],
  parent: [],
};

export function getNavItemsForRole(role: SessionClaims["role"]): NavItem[] {
  const allowedHrefs = NAV_HREFS_BY_ROLE[role];
  return ALL_NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/nav-items.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/lib/dashboard/nav-items.ts apps/web/tests/nav-items.test.ts
git commit -m "Add role-scoped navigation item list"
```

---

### Task 6: `requireDashboardRole` guard, `ComingSoon` component, and dashboard layout

**Files:**
- Create: `apps/web/src/lib/auth/require-dashboard-role.ts`
- Create: `apps/web/src/components/ComingSoon.tsx`
- Create: `apps/web/src/app/dashboard/layout.tsx`
- Test: `apps/web/tests/require-dashboard-role.test.ts`

**Interfaces:**
- Consumes: `verifySessionCookie`, `SESSION_COOKIE_NAME` from `apps/web/src/lib/auth/session-cookie.ts` (Task 2); `getNavItemsForRole` from `apps/web/src/lib/dashboard/nav-items.ts` (Task 5); `prisma` from `apps/web/src/lib/prisma.ts` (Foundation).
- Produces: `requireDashboardRole(allowedRoles: SessionClaims["role"][]): SessionClaims` — used by this task's layout and every page in Task 7. `ComingSoon({ feature: string })` component — used by every placeholder page in Task 7.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/require-dashboard-role.test.ts`:

```ts
import { vi } from "vitest";

const { cookieStore, redirectMock } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
  redirectMock: vi.fn((path: string) => {
    const error = new Error(`NEXT_REDIRECT:${path}`);
    throw error;
  }),
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

import { describe, it, expect, beforeEach } from "vitest";
import { requireDashboardRole } from "../src/lib/auth/require-dashboard-role";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireDashboardRole", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    redirectMock.mockClear();
  });

  it("returns claims when the session cookie has an allowed role", () => {
    const token = signSessionToken({ userId: 1, role: "admin", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = requireDashboardRole(["admin", "accountant"]);

    expect(claims.role).toBe("admin");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session cookie", () => {
    cookieStore.get.mockReturnValue(undefined);

    expect(() => requireDashboardRole(["admin"])).toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /dashboard when the role is not allowed for this page", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    expect(() => requireDashboardRole(["admin", "accountant"])).toThrow("NEXT_REDIRECT:/dashboard");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/require-dashboard-role.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/auth/require-dashboard-role'`

- [ ] **Step 3: Write the `requireDashboardRole` implementation**

`apps/web/src/lib/auth/require-dashboard-role.ts`:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import type { SessionClaims } from "./jwt";

export function requireDashboardRole(allowedRoles: SessionClaims["role"][]): SessionClaims {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims) {
    redirect("/login");
  }

  if (!allowedRoles.includes(claims.role)) {
    redirect("/dashboard");
  }

  return claims;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/require-dashboard-role.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Write the `ComingSoon` component**

`apps/web/src/components/ComingSoon.tsx`:

```tsx
export function ComingSoon({ feature }: { feature: string }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">{feature}</h1>
      <p className="mt-2 text-gray-500">This feature is coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 6: Write the dashboard layout**

`apps/web/src/app/dashboard/layout.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getNavItemsForRole } from "@/lib/dashboard/nav-items";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const navItems = getNavItemsForRole(claims.role);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-gray-50 p-4">
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full rounded px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-200"
          >
            Logout
          </button>
        </form>
      </aside>
      <div className="flex-1">
        <header className="flex justify-end border-b border-gray-200 p-4 text-sm text-gray-600">
          {user.name} ({claims.role})
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/web/src/lib/auth/require-dashboard-role.ts apps/web/src/components/ComingSoon.tsx apps/web/src/app/dashboard/layout.tsx apps/web/tests/require-dashboard-role.test.ts
git commit -m "Add requireDashboardRole guard, ComingSoon component, and dashboard layout"
```

---

### Task 7: Dashboard pages (home + placeholders)

**Files:**
- Create: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/app/dashboard/students/page.tsx`
- Create: `apps/web/src/app/dashboard/attendance/page.tsx`
- Create: `apps/web/src/app/dashboard/assignments/page.tsx`
- Create: `apps/web/src/app/dashboard/marks/page.tsx`
- Create: `apps/web/src/app/dashboard/timetable/page.tsx`
- Create: `apps/web/src/app/dashboard/fees/page.tsx`

**Interfaces:**
- Consumes: `requireDashboardRole` from `apps/web/src/lib/auth/require-dashboard-role.ts` (Task 6), `ComingSoon` from `apps/web/src/components/ComingSoon.tsx` (Task 6), `prisma` from `apps/web/src/lib/prisma.ts` (Foundation).
- Produces: nothing consumed by later tasks — this is the final task in this plan.

This task has no new automated tests: each page is a one-line application of `requireDashboardRole` (already fully tested in Task 6) plus either a database-backed welcome message or the already-built `ComingSoon` component. Verification for this task is a manual browser check (Step 8).

- [ ] **Step 1: Write the dashboard home page**

`apps/web/src/app/dashboard/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";

export default async function DashboardHomePage() {
  const claims = requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">
        Welcome, {user.name} ({claims.role})
      </h1>
    </div>
  );
}
```

- [ ] **Step 2: Write the Students placeholder page**

`apps/web/src/app/dashboard/students/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";

export default function StudentsPage() {
  requireDashboardRole(["teacher", "admin"]);
  return <ComingSoon feature="Students" />;
}
```

- [ ] **Step 3: Write the Attendance placeholder page**

`apps/web/src/app/dashboard/attendance/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";

export default function AttendancePage() {
  requireDashboardRole(["teacher", "admin"]);
  return <ComingSoon feature="Attendance" />;
}
```

- [ ] **Step 4: Write the Assignments placeholder page**

`apps/web/src/app/dashboard/assignments/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";

export default function AssignmentsPage() {
  requireDashboardRole(["teacher", "admin"]);
  return <ComingSoon feature="Assignments" />;
}
```

- [ ] **Step 5: Write the Exams & Marks placeholder page**

`apps/web/src/app/dashboard/marks/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";

export default function MarksPage() {
  requireDashboardRole(["teacher", "admin"]);
  return <ComingSoon feature="Exams & Marks" />;
}
```

- [ ] **Step 6: Write the Timetable placeholder page**

`apps/web/src/app/dashboard/timetable/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";

export default function TimetablePage() {
  requireDashboardRole(["teacher", "admin"]);
  return <ComingSoon feature="Timetable" />;
}
```

- [ ] **Step 7: Write the Fees placeholder page**

`apps/web/src/app/dashboard/fees/page.tsx`:

```tsx
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";

export default function FeesPage() {
  requireDashboardRole(["admin", "accountant"]);
  return <ComingSoon feature="Fees" />;
}
```

- [ ] **Step 8: Run the full automated test suite to confirm no regressions**

```bash
cd apps/web
npx vitest run
```

Expected: all existing test files pass (no new ones added this task).

- [ ] **Step 9: Commit**

```bash
cd ../..
git add apps/web/src/app/dashboard
git commit -m "Add dashboard home page and role-gated placeholder pages"
```

---

### Task 8: Login page

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Test: `apps/web/tests/login-page.test.tsx`
- Modify: `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: `/api/auth/send-otp` (Foundation) and `/api/auth/session` (Task 3) via `fetch` from the browser — no direct TypeScript import, since the client component only talks to these over HTTP.
- Produces: nothing consumed by later tasks — this is the final task in this plan.

- [ ] **Step 1: Install the React testing dependencies**

```bash
cd apps/web
npm install --save-dev @vitejs/plugin-react@4.3.2 @testing-library/react@16.0.1 @testing-library/jest-dom@6.5.0 @testing-library/user-event@14.5.2 jsdom@25.0.1
```

- [ ] **Step 2: Add the React plugin to the Vitest config**

Replace the full contents of `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    hookTimeout: 20000,
    testTimeout: 20000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 3: Write the failing test**

`apps/web/tests/login-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import LoginPage from "../src/app/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("moves to the OTP step after a successful send-otp call", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    });
  });

  it("shows an inline error for an unregistered phone number", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Phone number is not registered" }), { status: 404 })
    );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+19999999999");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(screen.getByText("Phone number is not registered")).toBeInTheDocument();
    });
  });

  it("navigates to /dashboard after a successful code verification", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.type(screen.getByLabelText("Verification code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows an inline error for an incorrect code", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "INVALID_CODE" }), { status: 401 })
      );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.type(screen.getByLabelText("Verification code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(screen.getByText("Incorrect or expired code. Try again")).toBeInTheDocument();
    });
  });

  it("returns to the phone step when Change number is clicked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.click(screen.getByRole("button", { name: "Change number" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npx vitest run tests/login-page.test.tsx
```

Expected: FAIL with `Cannot find module '../src/app/login/page'`

- [ ] **Step 5: Write the implementation**

`apps/web/src/app/login/page.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Step = "phone" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (response.status === 200) {
      setStep("otp");
      return;
    }
    if (response.status === 404) {
      setError("Phone number is not registered");
      return;
    }
    setError("Enter a phone number");
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });

    if (response.status === 200) {
      router.push("/dashboard");
      return;
    }
    if (response.status === 401) {
      setError("Incorrect or expired code. Try again");
      return;
    }
    setError("Enter the code");
  }

  function handleChangeNumber() {
    setStep("phone");
    setCode("");
    setError(null);
  }

  if (step === "phone") {
    return (
      <main className="mx-auto mt-24 max-w-sm p-6">
        <h1 className="mb-4 text-xl font-semibold text-gray-800">Staff Login</h1>
        <form onSubmit={handleSendCode} className="flex flex-col gap-3">
          <input
            type="tel"
            aria-label="Phone number"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Phone number"
          />
          <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
            Send code
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-800">Enter code</h1>
      <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
        <input
          type="text"
          aria-label="Verification code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="6-digit code"
        />
        <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
          Verify
        </button>
        <button
          type="button"
          onClick={handleChangeNumber}
          className="text-sm text-gray-500 underline"
        >
          Change number
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run tests/login-page.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 7: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all test files pass, including the pre-existing node-environment tests (the `jsdom` environment override in Step 3's docblock only applies to `login-page.test.tsx`).

- [ ] **Step 8: Manually verify the end-to-end flow in a browser**

```bash
docker compose up -d
npm run dev
```

Navigate to `http://localhost:3000/login`, enter a seeded staff phone number (e.g. `+10000000001`, the teacher from `prisma/fixtures.ts`), check the terminal running `npm run dev` for the logged OTP (via `ConsoleSmsSender`), enter it, and confirm you land on `/dashboard` with the sidebar showing the teacher's nav items (no Fees link) and "Anitha Rao (teacher)" in the header. Then click Logout and confirm you're returned to `/login`.

- [ ] **Step 9: Commit**

```bash
cd ../..
git add apps/web/src/app/login apps/web/tests/login-page.test.tsx apps/web/vitest.config.ts apps/web/package.json apps/web/package-lock.json
git commit -m "Add staff login page with phone and OTP steps"
```

---

## Definition of Done

- `/login` renders a phone-entry form; submitting a registered phone number advances to an OTP-entry form; entering the correct code redirects to `/dashboard`.
- `/api/auth/session` sets an HttpOnly, Secure, SameSite=Lax `session` cookie on success; returns 401 with no cookie on failure; returns 400 on a malformed body.
- `/api/auth/logout` clears the cookie and redirects to `/login`.
- `/dashboard` and its six sub-pages (`students`, `attendance`, `assignments`, `marks`, `timetable`, `fees`) are only reachable with a valid staff session; visiting without one redirects to `/login`.
- Each dashboard page enforces its own allowed roles (per the Global Constraints table); a disallowed role redirects to `/dashboard`.
- The sidebar shows only the nav items relevant to the logged-in user's role.
- `npx vitest run` passes end-to-end (all Foundation tests plus this plan's new tests) with zero manual setup beyond `docker compose up -d`.
