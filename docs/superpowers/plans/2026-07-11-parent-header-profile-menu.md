# Parent Header Profile Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the `/parent` header's separate name text + standalone Logout button into a single clickable avatar that opens a dropdown menu (Profile / Settings / Logout), and add the two new pages that menu links to.

**Architecture:** New `ProfileMenu` client component, built with the same local-`useState` + click-outside-listener pattern as the existing `NotificationBell`, replaces the raw initials chip + name + logout form in `ParentLayout`. Two new pages (`/parent/profile`, `/parent/settings`) are added as siblings of the existing `/parent/page.tsx`, so they inherit the same `ParentLayout` header and `requireParentRole` guard automatically — no new layout needed.

**Tech Stack:** Next.js (App Router) server/client components, Testing Library + Vitest, Tailwind CSS, `lucide-react`.

## Global Constraints

- Profile page is read-only — no edit form for name/phone (see spec §2).
- Settings page has no real functionality yet — reuses the existing `ComingSoon` component, same as `/dashboard/settings` (see spec §6).
- `/parent/profile` and `/parent/settings` are not unit-tested directly, matching the existing precedent for `/parent/layout.tsx` and `/parent/page.tsx` (thin server-component compositions of already-tested pieces) — see spec §7.
- Follow existing code style: no comments unless explaining non-obvious "why", Tailwind utility classes matching the existing neutral/teal palette already used in `ParentLayout`/`SummaryCards.tsx`.

---

### Task 1: `ProfileMenu` component

**Files:**
- Create: `apps/web/src/components/parent/ProfileMenu.tsx`
- Test: `apps/web/tests/profile-menu.test.tsx`

**Interfaces:**
- Consumes: `Link` from `next/link` (already used in `ChildSwitcher.tsx`).
- Produces: `ProfileMenu({ initials }: { initials: string })` — a self-contained client component. Consumed by `ParentLayout` in Task 2.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/profile-menu.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileMenu } from "../src/components/parent/ProfileMenu";

describe("ProfileMenu", () => {
  afterEach(() => cleanup());

  it("does not show the menu initially", () => {
    render(<ProfileMenu initials="PS" />);
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("shows the menu after clicking the avatar", async () => {
    render(<ProfileMenu initials="PS" />);
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("links Profile and Settings to their respective pages", async () => {
    render(<ProfileMenu initials="PS" />);
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByText("Profile")).toHaveAttribute("href", "/parent/profile");
    expect(screen.getByText("Settings")).toHaveAttribute("href", "/parent/settings");
  });

  it("renders Logout as a submit button inside a form posting to /api/auth/logout", async () => {
    render(<ProfileMenu initials="PS" />);
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    const logoutButton = screen.getByRole("button", { name: "Logout" });
    expect(logoutButton).toHaveAttribute("type", "submit");
    expect(logoutButton.closest("form")).toHaveAttribute("action", "/api/auth/logout");
    expect(logoutButton.closest("form")).toHaveAttribute("method", "POST");
  });

  it("hides the menu after clicking elsewhere in the document", async () => {
    render(
      <div>
        <ProfileMenu initials="PS" />
        <p>Elsewhere</p>
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByText("Profile")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Elsewhere"));
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("hides the menu after clicking the avatar a second time", async () => {
    render(<ProfileMenu initials="PS" />);
    const button = screen.getByRole("button", { name: "Profile menu" });

    await userEvent.click(button);
    expect(screen.getByText("Profile")).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/profile-menu.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/parent/ProfileMenu'`

- [ ] **Step 3: Implement `ProfileMenu`**

Create `apps/web/src/components/parent/ProfileMenu.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function ProfileMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  const menuItemClass = "block px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Profile menu"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6] text-xs font-bold text-white"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-10 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-md">
          <Link href="/parent/profile" className={menuItemClass}>
            Profile
          </Link>
          <Link href="/parent/settings" className={menuItemClass}>
            Settings
          </Link>
          <hr className="my-1 border-neutral-200" />
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className={`w-full text-left ${menuItemClass}`}>
              Logout
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/profile-menu.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/parent/ProfileMenu.tsx apps/web/tests/profile-menu.test.tsx
git commit -m "Add parent profile menu component"
```

---

### Task 2: Wire `ProfileMenu` into the parent header

**Files:**
- Modify: `apps/web/src/app/parent/layout.tsx`

**Interfaces:**
- Consumes: `ProfileMenu` from `apps/web/src/components/parent/ProfileMenu.tsx` (Task 1).
- Produces: no new exports — visual wiring only.

This task has no isolated unit test — `ParentLayout` is a thin server-component composition of already-tested pieces (`ProfileMenu`, fully covered in Task 1). It's exercised manually in Task 5's verification.

- [ ] **Step 1: Add the import and replace the header's right-hand group**

In `apps/web/src/app/parent/layout.tsx`, add the import:

```tsx
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { NotificationBell } from "@/components/parent/NotificationBell";
import { ProfileMenu } from "@/components/parent/ProfileMenu";
```

and replace:

```tsx
        <div className="flex items-center gap-3">
          <NotificationBell />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6] text-xs font-bold text-white">
            {initials}
          </div>
          <span className="text-xs font-semibold text-neutral-800">{user.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-black"
            >
              Logout
            </button>
          </form>
        </div>
```

with:

```tsx
        <div className="flex items-center gap-3">
          <NotificationBell />
          <ProfileMenu initials={initials} />
        </div>
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/layout.tsx
git commit -m "Collapse parent header name/logout into the profile menu"
```

---

### Task 3: `/parent/profile` page

**Files:**
- Create: `apps/web/src/app/parent/profile/page.tsx`

**Interfaces:**
- Consumes: `requireParentRole` (`apps/web/src/lib/auth/require-parent-role.ts`), `prisma` (`apps/web/src/lib/prisma.ts`).
- Produces: no new exports — leaf page, automatically wrapped by `ParentLayout`.

No isolated unit test, per Global Constraints — verified manually in Task 5.

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/parent/profile/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";

export default async function ParentProfilePage() {
  const claims = requireParentRole();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: claims.schoolId } });

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <h1 className="mb-4 text-sm font-bold text-neutral-800">Profile</h1>
      <dl className="space-y-3 text-xs">
        <div>
          <dt className="font-semibold text-neutral-400">Name</dt>
          <dd className="text-neutral-800">{user.name}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-400">Phone</dt>
          <dd className="text-neutral-800">{user.phone}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-400">School</dt>
          <dd className="text-neutral-800">{school.name}</dd>
        </div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/profile/page.tsx
git commit -m "Add read-only parent profile page"
```

---

### Task 4: `/parent/settings` page

**Files:**
- Create: `apps/web/src/app/parent/settings/page.tsx`

**Interfaces:**
- Consumes: `requireParentRole` (`apps/web/src/lib/auth/require-parent-role.ts`), `ComingSoon` (`apps/web/src/components/ComingSoon.tsx`), `Settings` icon from `lucide-react`.
- Produces: no new exports — leaf page, automatically wrapped by `ParentLayout`.

No isolated unit test, per Global Constraints — verified manually in Task 5. Directly mirrors the existing `apps/web/src/app/dashboard/settings/page.tsx`.

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/parent/settings/page.tsx`:

```tsx
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { ComingSoon } from "@/components/ComingSoon";
import { Settings } from "lucide-react";

export default function ParentSettingsPage() {
  requireParentRole();
  return <ComingSoon feature="Settings" icon={Settings} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/parent/settings/page.tsx
git commit -m "Add parent settings placeholder page"
```

---

### Task 5: Full-suite verification and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `cd apps/web && npx dotenv -e .env.test -- npx vitest run`
Expected: all tests pass, including `profile-menu.test.tsx` from Task 1.

- [ ] **Step 2: Run the typechecker across the whole app**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually walk through the new header and pages**

Using the dev server and a seeded parent phone number:
1. Log in as a parent and land on `/parent`.
2. Confirm the header's right side now shows only the notification bell and the initials avatar — no separate name text, no standalone Logout button.
3. Click the avatar — confirm a dropdown opens with Profile, Settings, a divider, and Logout.
4. Click elsewhere on the page — confirm the dropdown closes.
5. Click the avatar, then click "Profile" — confirm it navigates to `/parent/profile` and shows the parent's name, phone, and school name, with the same header (bell + avatar) still present.
6. Click the avatar, then click "Settings" — confirm it navigates to `/parent/settings` and shows the "Settings is coming soon" placeholder, with the same header still present.
7. Click the avatar, then click "Logout" — confirm it logs out and redirects to `/login`.

Expected: every step behaves as described above with no console errors.

- [ ] **Step 4: Report results**

If any step in Step 3 fails, fix the underlying task before proceeding — do not commit a workaround here. Once all steps pass, this plan is complete; no further commit is needed for this task.
