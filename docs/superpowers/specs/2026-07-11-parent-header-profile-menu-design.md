# Parent Header: Profile Menu — Design Spec

Status: Approved — 2026-07-11

## 1. Problem

The `/parent` header currently shows the parent's initials avatar, their full name as separate text, and a standalone "Logout" button side by side (see `ParentLayout` in [2026-07-10-parent-login-design.md](2026-07-10-parent-login-design.md)). This spec collapses that into a single clickable avatar that opens a dropdown menu (Profile / Settings / Logout), and adds the two new destination pages that menu links to.

## 2. Scope

**In scope**
- Restructure the `/parent` header: remove the standalone name text and Logout button, keep only the initials avatar, now clickable.
- New `ProfileMenu` client component: clicking the avatar toggles a dropdown with **Profile**, **Settings**, a divider, and **Logout**.
- New `/parent/profile` page: read-only account details (name, phone, school name).
- New `/parent/settings` page: reuses the existing `ComingSoon` component, matching the same "not built yet" treatment already used for `/dashboard/settings`, `/dashboard/reports`, `/dashboard/resources`.

**Out of scope**
- Any editable profile fields (name/phone change) — read-only only, per section 4.
- Any real settings functionality (notification preferences, etc.) — explicitly deferred, same as the dashboard's own Settings page.
- Changes to the staff `/dashboard` header — parent header only.

## 3. `ProfileMenu` Component

New file `src/components/parent/ProfileMenu.tsx`, a `"use client"` component. Same interaction pattern as the existing `NotificationBell` (`src/components/parent/NotificationBell.tsx`): local `useState<boolean>` for open/closed, a `document` click-outside listener attached only while open, closes on click-away or clicking the trigger again.

Props: `{ initials: string }` — the avatar is rendered here (moved out of `ParentLayout`), not passed in as a child, so this component owns its own trigger element rather than wrapping an external one.

Structure:
- Trigger: the existing initials avatar markup (`h-8 w-8` rounded chip, `bg-[#14B8A6]`, initials text) as a `<button>`, `aria-label="Profile menu"`.
- Dropdown (shown when open, anchored `absolute right-0 top-10`): three rows —
  - **Profile** — `<Link href="/parent/profile">`
  - **Settings** — `<Link href="/parent/settings">`
  - a `<hr>` divider
  - **Logout** — a `<form action="/api/auth/logout" method="POST">` with a submit button, styled as a menu row (not the standalone black button it is today)
- Clicking any menu link/button does not need extra close logic — navigating away or submitting the logout form unmounts the component.

## 4. Header Wiring

`ParentLayout` (`src/app/parent/layout.tsx`) changes:
- Remove: the name `<span>`, the standalone `<form action="/api/auth/logout">` button, and the raw initials-chip `<div>`.
- Add: `<ProfileMenu initials={initials} />` in their place, still after `<NotificationBell />` in the header's right-hand group.
- The `initials` computation (from `user.name`) stays in `ParentLayout` — it already needs `user.name` for other purposes and this keeps `ProfileMenu` a pure presentational component with no data fetching.

Both `/parent/profile` and `/parent/settings` are new routes nested under `/parent/`, so they automatically render inside `ParentLayout` (same header, same auth guard via `requireParentRole`) — no separate layout needed.

## 5. `/parent/profile` Page

New file `src/app/parent/profile/page.tsx`, a server component:
- Calls `requireParentRole()` (same guard as `/parent/page.tsx`).
- Fetches the same `User` and `School` records `ParentLayout` already fetches (a second, independent fetch — Next.js dedupes identical `fetch`/Prisma calls per-request only, not across layout/page boundaries, and this matches the existing pattern where `/dashboard/*` pages also re-fetch their own data rather than threading it through props).
- Renders a read-only card (same `rounded-2xl border ... bg-white` card style as `SummaryCards.tsx`) with three rows: Name, Phone, School — each a label/value pair.

## 6. `/parent/settings` Page

New file `src/app/parent/settings/page.tsx`:
```tsx
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { ComingSoon } from "@/components/ComingSoon";
import { Settings } from "lucide-react";

export default function ParentSettingsPage() {
  requireParentRole();
  return <ComingSoon feature="Settings" icon={Settings} />;
}
```
Directly mirrors `src/app/dashboard/settings/page.tsx`'s existing pattern, swapped to the parent role guard.

## 7. Testing

- `profile-menu.test.tsx` — same shape as the existing `notification-bell.test.tsx`: popover closed initially, opens on trigger click, closes on click-away, closes on second trigger click. Additionally asserts the three menu rows render with correct `href`s (`/parent/profile`, `/parent/settings`) and that the Logout row is a submit button inside a form posting to `/api/auth/logout`.
- No test for `/parent/profile/page.tsx` or `/parent/settings/page.tsx` themselves — consistent with the rest of `/parent/*` and `/dashboard/*` pages in this codebase, which are thin server-component compositions of already-tested pieces and aren't unit-tested directly (see the existing precedent noted in the parent-login plan for `/parent/layout.tsx` and `/parent/page.tsx`). Verified manually instead.

## 8. Risks & Follow-ups

- **Duplicate `User`/`School` fetch** between `ParentLayout` and the new `/parent/profile` page is a minor, accepted inefficiency — matches existing codebase precedent (each `/dashboard/*` page fetches its own data independently of the layout) rather than introducing a new shared-data-fetching mechanism for one page.
- Editable profile fields and real settings functionality remain explicitly deferred, per section 2.
