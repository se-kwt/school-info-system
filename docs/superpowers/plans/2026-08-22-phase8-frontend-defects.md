# Phase 8: Front-End Defects and Stub Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the ten systemic UI defects from the audit's front-end section, make notification routing use the `relatedId` that is already stored and ignored, and stop the navigation from leading to placeholder pages.

**Architecture:** Nine sequential tasks. Tasks 1–2 are the shared primitives — modal accessibility and a double-submit guard — done first because six other surfaces consume them. Tasks 3–9 are the individual defects. No schema changes and no service changes except where a row type needs a field projected. Each task lands as its own commit.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 + Testing Library, TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 8).

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` clean after every task; previously-passing tests stay green. Record the baseline before Task 1.
- **No migration in this phase.** `prisma/schema.prisma` is not modified.
- Tests are Testing Library component tests following the patterns in `tests/students-view.test.tsx` and `tests/classes-view.test.tsx`.
- Failing test first, always.

## Two corrections to the audit — read before starting

Reading the current tree turned up two findings that are wrong or overstated. Both change what a task does.

**1. The test-OTP affordance is already gated, on the server.** The audit says the login page "surfaces a test-OTP affordance with no visible environment gating in that file." That is literally true of `src/app/login/page.tsx`, but misleading. `POST /api/auth/send-otp` passes `exposeCodeForTesting: process.env.EXPOSE_OTP_FOR_TESTING === "true"` into `sendOtp`, and `sendOtp` returns the code only when that flag is set (`src/lib/auth/send-otp.ts:57`). Without the env var the response carries no `code`, the client's `testOtp` state stays null, and the toast never renders. **There is no vulnerability here.** Task 8 is reduced to a regression test plus a comment, not a fix.

**2. Notification routing has only one type to route.** The audit says notifications navigate to `/parent/assignments` "regardless of type — a fee-due alert opens the homework list." There is no fee-due alert: `grep -rn "notification.create" src/` returns exactly one site, `assignments.ts:148`, writing `type: "assignment_published"`. So today's hardcoded destination is coincidentally correct. **The real defect is the ignored `relatedId`** — a notification about a specific assignment dumps the parent on the list instead of opening that assignment. Task 3 fixes that and adds a type map so the next notification type routes correctly, but do not write tests asserting behaviour for notification types that no code produces.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `src/components/school-setup/Modal.tsx` | `role="dialog"`, `aria-modal`, focus trap, focus return |
| `src/hooks/useSubmitGuard.ts` | **New** — shared double-submit guard |
| `src/lib/format.ts` | **New** — `formatDate`, `formatDateTime` |
| `src/components/parent/NotificationBell.tsx` | Route by type and `relatedId` |
| `src/components/parent/ChildSwitcher.tsx` | Preserve the current section |
| `src/components/school-setup/StudentsView.tsx` | Filter by `classId`; search; pagination; Deactivate |
| `src/components/school-setup/StaffView.tsx` | Search; pagination; Deactivate |
| `src/lib/data/nav-items.ts` | Remove the two stub entries; link the promotion wizard |
| `src/app/dashboard/settings/page.tsx` | A real page for teacher and accountant |

---

- [ ] **Task 0: Establish the baseline**

Run: `npm test 2>&1 | tail -20` and record the passing count.

---

### Task 1: Make the shared modal accessible

`Modal.tsx` is used by every admin CRUD dialog. It has no `role="dialog"`, no `aria-modal`, no focus trap and no focus return. Escape-to-close already works, and the backdrop click already works — those stay.

Fixing this once fixes it for every dialog in the product, which is why it is first.

**Files:**
- Modify: `apps/web/src/components/school-setup/Modal.tsx`
- Test: `apps/web/tests/modal.test.tsx` (create)

**Interfaces:**
- Produces: `Modal` gains a required `title: string` prop. **Every call site must pass it** — an `aria-labelledby` pointing at nothing is worse than no label. Find them with `grep -rln "<Modal" src/`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../src/components/school-setup/Modal";

describe("Modal accessibility", () => {
  it("exposes itself as a labelled modal dialog", () => {
    render(
      <Modal title="Edit student" onClose={() => {}}>
        <button type="button">Inside</button>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Edit student");
  });

  it("moves focus into the dialog on open", () => {
    render(
      <Modal title="Edit student" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Second</button>
      </Modal>
    );

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement);
  });

  it("traps Tab inside the dialog", async () => {
    render(
      <Modal title="Edit student" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    );

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });

    last.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(first);

    first.focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("returns focus to the trigger on close", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          {open && (
            <Modal title="Edit student" onClose={() => setOpen(false)}>
              <button type="button">Inside</button>
            </Modal>
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");

    expect(document.activeElement).toBe(trigger);
  });

  it("still closes on Escape and on backdrop click", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit student" onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

The last test is the regression guard for the two behaviours that already work.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/modal.test.tsx`

Expected: FAIL — there is no element with `role="dialog"`.

- [ ] **Step 3: Rewrite the modal**

```tsx
"use client";

import { useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  children,
  title,
  onClose,
  maxWidthClassName = "max-w-lg",
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  maxWidthClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[85vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-2xl bg-white shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <div className="modal-scroll flex flex-col gap-4 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
```

Three details worth not losing:

- The focus-return runs in the effect **cleanup**, so it fires however the modal unmounts — Escape, backdrop, save, or the parent re-rendering it away.
- `offsetParent !== null` filters out hidden elements, which otherwise become invisible tab stops in a form with conditional sections.
- The `<h2 className="sr-only">` gives the dialog an accessible name without changing any existing visual layout. Every call site already renders its own visible heading; do not try to reuse those, because their markup differs per dialog.

- [ ] **Step 4: Pass `title` at every call site**

Run: `grep -rn "<Modal" src/`

Add a `title` to each — the same wording as the dialog's own visible heading.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/modal.test.tsx && npm test 2>&1 | tail -20`

Existing dialog tests may now fail if they query by a text that appears twice — once in the `sr-only` heading and once in the visible one. Narrow those queries with `getByRole("heading", { level: N })` rather than removing the `sr-only` element.

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 7: Commit**

```bash
git add src/components/school-setup/Modal.tsx src/components tests/modal.test.tsx
git commit -m "fix(a11y): make the shared modal a proper dialog with a focus trap"
```

---

### Task 2: A shared double-submit guard

Only the assignments views guard against double submission — `AssignmentsView.tsx` holds both an `isSubmitting` state and an `isSubmittingRef`. Every other mutating button in the product can fire twice, and on a slow connection routinely does.

The ref matters as much as the state: React batches state updates, so two clicks in the same tick both see `isSubmitting === false`. Extract the working pattern rather than reimplementing it.

**Files:**
- Create: `apps/web/src/hooks/useSubmitGuard.ts`
- Modify: every mutating view
- Test: `apps/web/tests/use-submit-guard.test.tsx` (create)

**Interfaces:**
- Produces: `useSubmitGuard(): { isSubmitting: boolean; run: (fn: () => Promise<void>) => Promise<void> }`.

- [ ] **Step 1: Write the failing test**

```typescript
it("runs the callback once when fired twice in the same tick", async () => {
  const work = vi.fn().mockImplementation(() => new Promise<void>((r) => setTimeout(r, 20)));

  function Harness() {
    const { isSubmitting, run } = useSubmitGuard();
    return (
      <button type="button" disabled={isSubmitting} onClick={() => void run(work)}>
        Save
      </button>
    );
  }

  render(<Harness />);
  const button = screen.getByRole("button", { name: "Save" });

  button.click();
  button.click();

  await waitFor(() => expect(work).toHaveBeenCalledTimes(1));
});

it("re-enables after the callback settles", async () => {
  const work = vi.fn().mockResolvedValue(undefined);

  function Harness() {
    const { isSubmitting, run } = useSubmitGuard();
    return (
      <button type="button" disabled={isSubmitting} onClick={() => void run(work)}>
        Save
      </button>
    );
  }

  render(<Harness />);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());

  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(work).toHaveBeenCalledTimes(2);
});

it("re-enables when the callback throws", async () => {
  const work = vi.fn().mockRejectedValue(new Error("network"));

  function Harness() {
    const { isSubmitting, run } = useSubmitGuard();
    return (
      <button type="button" disabled={isSubmitting} onClick={() => void run(work).catch(() => {})}>
        Save
      </button>
    );
  }

  render(<Harness />);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
});
```

Direct `.click()` rather than `userEvent.click` in the first test is deliberate — `userEvent` awaits between actions, which is exactly the race the guard exists to prevent.

The third test is the one that catches the common mistake: resetting the flag only on success leaves the button permanently dead after one network error.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/use-submit-guard.test.tsx`

- [ ] **Step 3: Write the hook**

```typescript
"use client";

import { useCallback, useRef, useState } from "react";

export function useSubmitGuard() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      await fn();
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }, []);

  return { isSubmitting, run };
}
```

The `finally` is what makes the third test pass.

- [ ] **Step 4: Adopt it everywhere**

Find every mutating handler:

```bash
grep -rn "method: \"POST\"\|method: \"PATCH\"\|method: \"PUT\"\|method: \"DELETE\"" src/components src/app
```

For each, wrap the handler body in `run(...)` and add `disabled={isSubmitting}` to its button. Convert `AssignmentsView.tsx` to the hook too — leaving its hand-rolled copy in place is how the two drift apart.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/use-submit-guard.test.tsx && npm test 2>&1 | tail -20`

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 7: Commit**

```bash
git add src/hooks src/components tests/use-submit-guard.test.tsx
git commit -m "fix(ui): guard every mutating control against double submission"
```

---

### Task 3: Route notifications by type and `relatedId`

Read correction 2 in the header first.

`NotificationBell.handleNotificationClick` ends with `window.location.href = "/parent/assignments"` (`NotificationBell.tsx:58`), discarding both `type` and `relatedId`. Today only `assignment_published` exists, so the destination is right but the specificity is wrong: a notification about one assignment opens the whole list.

**Files:**
- Modify: `apps/web/src/components/parent/NotificationBell.tsx`
- Test: `apps/web/tests/notification-bell.test.tsx` (confirm with `ls tests | grep -i notif`)

- [ ] **Step 1: Write the failing tests**

```typescript
it("opens the specific assignment a notification refers to", async () => {
  render(
    <NotificationBell
      initialNotifications={[
        { id: 1, type: "assignment_published", title: "Maths homework", body: "Due 2026-09-01", relatedId: 42, readAt: null, createdAt: "2026-08-20T00:00:00.000Z" },
      ]}
      initialUnreadCount={1}
    />
  );

  await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
  await userEvent.click(screen.getByText("Maths homework"));

  expect(window.location.href).toBe("/parent/assignments/42");
});

it("falls back to the list when relatedId is missing", async () => {
  render(
    <NotificationBell
      initialNotifications={[
        { id: 1, type: "assignment_published", title: "Maths homework", body: "", relatedId: null, readAt: null, createdAt: "2026-08-20T00:00:00.000Z" },
      ]}
      initialUnreadCount={1}
    />
  );

  await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
  await userEvent.click(screen.getByText("Maths homework"));

  expect(window.location.href).toBe("/parent/assignments");
});

it("falls back to the overview for an unrecognised type", async () => {
  render(
    <NotificationBell
      initialNotifications={[
        { id: 1, type: "some_future_type", title: "Something", body: "", relatedId: 7, readAt: null, createdAt: "2026-08-20T00:00:00.000Z" },
      ]}
      initialUnreadCount={1}
    />
  );

  await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
  await userEvent.click(screen.getByText("Something"));

  expect(window.location.href).toBe("/parent");
});
```

`window.location.href` is not writable in jsdom by default — stub it in the test setup with `Object.defineProperty(window, "location", { value: { href: "" }, writable: true })`, or refactor the component to use Next's `useRouter`. Prefer the router: it is the idiomatic Next approach, it avoids a full page reload, and it makes the test a straightforward `push` assertion. If you take that route, assert on a mocked `push` instead of `window.location.href`.

Read the component's real prop names before writing these — the names above are inferred.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notification-bell.test.tsx -t "specific assignment"`

- [ ] **Step 3: Add the route map**

```typescript
function notificationHref(notification: { type: string; relatedId: number | null }): string {
  switch (notification.type) {
    case "assignment_published":
      return notification.relatedId
        ? `/parent/assignments/${notification.relatedId}`
        : "/parent/assignments";
    default:
      return "/parent";
  }
}
```

One entry, because one type exists. The `default` is what makes this worth writing: the next notification type added lands on the overview rather than silently on the homework list, and the omission is obvious to whoever adds it.

Replace the hardcoded assignment in `handleNotificationClick` with `notificationHref(notification)`.

- [ ] **Step 4: Confirm the deep-link route exists**

Run: `ls src/app/parent/assignments`

The audit's page inventory lists a parent assignment detail page. Verify its path segment matches what `notificationHref` builds — if it is `[id]`, the URL above is right; if it is something else, match it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/notification-bell.test.tsx`

- [ ] **Step 6: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components/parent/NotificationBell.tsx tests
git commit -m "fix(notifications): route by type and relatedId"
```

---

### Task 4: Keep the parent on the current section when switching child

`ChildSwitcher` links to `/parent?studentId=${child.id}` (`ChildSwitcher.tsx:19`) unconditionally. A parent comparing two children's attendance is thrown back to the overview on every switch.

**Files:**
- Modify: `apps/web/src/components/parent/ChildSwitcher.tsx`
- Test: `apps/web/tests/child-switcher.test.tsx` (exists)

- [ ] **Step 1: Write the failing tests**

```typescript
it("stays on the attendance section when switching child", () => {
  vi.mock("next/navigation", () => ({ usePathname: () => "/parent/attendance" }));

  render(<ChildSwitcher children={[{ id: 1, name: "A" }, { id: 2, name: "B" }]} activeChildId={1} />);

  expect(screen.getByRole("link", { name: /B/ })).toHaveAttribute(
    "href",
    "/parent/attendance?studentId=2"
  );
});

it("stays on a nested section", () => {
  vi.mock("next/navigation", () => ({ usePathname: () => "/parent/assignments/completed" }));

  render(<ChildSwitcher children={[{ id: 1, name: "A" }, { id: 2, name: "B" }]} activeChildId={1} />);

  expect(screen.getByRole("link", { name: /B/ })).toHaveAttribute(
    "href",
    "/parent/assignments/completed?studentId=2"
  );
});

it("drops a detail-page id rather than carrying it to another child", () => {
  vi.mock("next/navigation", () => ({ usePathname: () => "/parent/assignments/42" }));

  render(<ChildSwitcher children={[{ id: 1, name: "A" }, { id: 2, name: "B" }]} activeChildId={1} />);

  expect(screen.getByRole("link", { name: /B/ })).toHaveAttribute(
    "href",
    "/parent/assignments?studentId=2"
  );
});
```

`vi.mock` is hoisted, so the three cases cannot each mock differently in one file. Use `vi.mocked(usePathname).mockReturnValue(...)` per test with a single top-level mock instead. Read the existing `tests/child-switcher.test.tsx` for how it already handles this.

The third test is the one that needs thought. `/parent/assignments/42` is child A's assignment; carrying that id to child B would either 404 or — worse — be a cross-child access attempt that the parent-scoping code correctly rejects, leaving the parent staring at an error. Strip the trailing numeric segment.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/child-switcher.test.tsx -t "attendance section"`

- [ ] **Step 3: Derive the href from the pathname**

```typescript
"use client";

import { usePathname } from "next/navigation";

function sectionPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // Drop a trailing numeric segment: it identifies the current child's record,
  // and it is meaningless — or forbidden — for a different child.
  if (segments.length > 0 && /^\d+$/.test(segments[segments.length - 1])) {
    segments.pop();
  }
  return "/" + segments.join("/");
}
```

Then build each link as `` `${sectionPath(pathname)}?studentId=${child.id}` ``.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/child-switcher.test.tsx`

- [ ] **Step 5: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/components/parent/ChildSwitcher.tsx tests
git commit -m "fix(parent): keep the current section when switching child"
```

---

### Task 5: Filter students by class id, not by name and section

The students view filters by grade name plus section rather than class id, so "Grade 5 · A" in two different years collapses into one bucket — and after Phase 1 those two classes cannot both hold current students anyway, which makes the filter both wrong and confusing.

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx`
- Test: `apps/web/tests/students-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
it("filters by class id, so identically-named classes stay distinct", async () => {
  render(
    <StudentsView
      initialStudents={[
        { id: 1, name: "Current Year Student", classId: 10, className: "Grade 5 · A", dob: "2015-01-01", admissionNo: "A1", status: "active" },
        { id: 2, name: "Prior Year Student", classId: 20, className: "Grade 5 · A", dob: "2015-01-01", admissionNo: "A2", status: "active" },
      ]}
      classes={[
        { id: 10, gradeId: 5, gradeName: "Grade 5", section: "A" },
        { id: 20, gradeId: 5, gradeName: "Grade 5", section: "A" },
      ]}
    />
  );

  await userEvent.selectOptions(screen.getByLabelText(/filter by class/i), "10");

  expect(screen.getByText("Current Year Student")).toBeInTheDocument();
  expect(screen.queryByText("Prior Year Student")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/students-view.test.tsx -t "filters by class id"`

Expected: FAIL — both students render, because the filter matches on the identical `className` string.

- [ ] **Step 3: Filter on the id**

Find the filter predicate and change it to compare `student.classId` against the selected class id. The `<option value>` must be the class id, and the select's state a number (or a string compared consistently).

If the student row type has no `classId`, add it and project it from the list query — the enrollment carries it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/students-view.test.tsx tests/students-api.test.ts`

- [ ] **Step 5: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/components src/lib/school-setup tests
git commit -m "fix(students): filter by class id rather than name and section"
```

---

### Task 6: Search and pagination on Staff and Students

Staff and Students render unbounded lists while Classes and Grades have both search and pagination — inconsistent within the same admin surface, and unusable for a school with 800 students.

`GridToolbar.tsx` and `Pagination.tsx` already exist and are used by the working views. Reuse them.

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx`, `StaffView.tsx`
- Test: `apps/web/tests/students-view.test.tsx`, `tests/staff-view.test.tsx`

- [ ] **Step 1: Read the working implementation first**

```bash
sed -n '1,80p' src/components/school-setup/ClassesView.tsx
cat src/components/school-setup/GridToolbar.tsx
cat src/components/school-setup/Pagination.tsx
```

Match that implementation's page size, its search debounce (if any), and its behaviour when a search empties the current page. Do not invent a second pattern.

- [ ] **Step 2: Write the failing tests**

```typescript
it("filters the student list by search term", async () => {
  render(/* StudentsView with "Anita Menon" and "Bhavesh Kumar" */);

  await userEvent.type(screen.getByLabelText(/search/i), "anita");

  expect(screen.getByText("Anita Menon")).toBeInTheDocument();
  expect(screen.queryByText("Bhavesh Kumar")).toBeNull();
});

it("searches admission number as well as name", async () => {
  render(/* same, Bhavesh has admissionNo "ADM-777" */);

  await userEvent.type(screen.getByLabelText(/search/i), "ADM-777");

  expect(screen.getByText("Bhavesh Kumar")).toBeInTheDocument();
  expect(screen.queryByText("Anita Menon")).toBeNull();
});

it("paginates a long list", async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    id: i + 1,
    name: `Student ${i + 1}`,
    classId: 1,
    className: "Grade 1 · A",
    dob: "2015-01-01",
    admissionNo: `A${i + 1}`,
    status: "active" as const,
  }));

  render(/* StudentsView with `many` */);

  expect(screen.queryByText("Student 45")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /next/i }));
  expect(screen.getByText("Student 45")).toBeInTheDocument();
});

it("returns to the first page when the search changes", async () => {
  render(/* StudentsView with 45 students */);

  await userEvent.click(screen.getByRole("button", { name: /next/i }));
  await userEvent.type(screen.getByLabelText(/search/i), "Student 1");

  expect(screen.getByText("Student 1")).toBeInTheDocument();
});
```

The fourth test catches the classic bug: searching while on page 3 shows an empty page because the filtered set is shorter than the offset.

Write the equivalent four for `StaffView`, searching name and phone.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/students-view.test.tsx -t "search term"`

- [ ] **Step 4: Add the toolbar and pagination**

Wire `GridToolbar` and `Pagination` into both views exactly as `ClassesView` does. Search matches name and admission number for students; name and phone for staff. Case-insensitive on both.

Reset the page to 1 whenever the search term or the class filter changes.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/students-view.test.tsx tests/staff-view.test.tsx`

- [ ] **Step 6: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components tests
git commit -m "feat(admin): add search and pagination to Staff and Students"
```

---

### Task 7: Show Deactivate without requiring a failed delete

For staff and students alike, "Deactivate" only appears after a delete has been attempted and refused with `HAS_HISTORY`. Deactivating a student who has left mid-year is a routine action and should not require first attempting a destructive one.

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx`, `StaffView.tsx`, `KebabMenu.tsx` usage
- Test: `apps/web/tests/students-view.test.tsx`, `tests/staff-view.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
it("offers Deactivate without a failed delete first", async () => {
  render(/* StudentsView with one active student */);

  await userEvent.click(screen.getByRole("button", { name: /actions for anita menon/i }));

  expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
});

it("offers Activate instead for an inactive student", async () => {
  render(/* StudentsView with one student whose status is "inactive" */);

  await userEvent.click(screen.getByRole("button", { name: /actions for former student/i }));

  expect(screen.getByRole("button", { name: /^activate/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /deactivate/i })).toBeNull();
});
```

Read `KebabMenu.tsx` for the real accessible name of the trigger and align the queries.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/students-view.test.tsx -t "without a failed delete"`

- [ ] **Step 3: Render the action from status**

Find the state that currently gates the Deactivate item — a flag set in the delete error handler. Delete that flag and render the item from the row's `status` instead: `status === "active"` shows Deactivate, otherwise Activate.

Keep the delete item and its `HAS_HISTORY` error message exactly as they are. Delete and deactivate are different operations, and an admin who wants the record gone should still be told why they cannot have that.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/students-view.test.tsx tests/staff-view.test.tsx`

- [ ] **Step 5: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/components tests
git commit -m "fix(admin): show Deactivate without requiring a failed delete"
```

---

### Task 8: Consistent client validation, date formatting, and the OTP regression test

Three small defects grouped because each is a handful of lines and none warrants its own review gate.

**8a — Client validation.** Assignments validates client-side; Fees, Marks, Periods, Academic Years and Classes do not. No start-before-end checks, no non-negative amounts.

**8b — Date formatting.** Dates render as raw ISO strings nearly everywhere; one component uses `toLocaleDateString`.

**8c — The test OTP.** Read correction 1 in the header. This is **already gated on the server** and needs no fix — only a regression test so nobody removes the gate, and a comment in the page so the next reader does not re-file the finding.

**Files:**
- Create: `apps/web/src/lib/format.ts`
- Modify: the five unvalidated views; every date-rendering component; `src/app/login/page.tsx` (comment only)
- Test: `apps/web/tests/format.test.ts` (create), `tests/send-otp.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

In `tests/format.test.ts`:

```typescript
it("formats an ISO date as a readable date", () => {
  expect(formatDate("2026-09-01")).toBe("1 Sep 2026");
});

it("formats a Date object the same way", () => {
  expect(formatDate(new Date("2026-09-01T00:00:00.000Z"))).toBe("1 Sep 2026");
});

it("returns an em dash for null", () => {
  expect(formatDate(null)).toBe("—");
});
```

In `tests/send-otp.test.ts`:

```typescript
it("does not return the code unless explicitly asked to expose it", async () => {
  const result = await sendOtp("+919876543210", {
    prisma,
    smsSender: new NoopSmsSender(),
  });

  expect(result).toEqual({ success: true });
  expect("code" in result).toBe(false);
});

it("returns the code only when exposeCodeForTesting is true", async () => {
  const result = await sendOtp("+919876543211", {
    prisma,
    smsSender: new NoopSmsSender(),
    exposeCodeForTesting: true,
  });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(typeof result.code).toBe("string");
});
```

Validation tests, one per view — this shape for each:

```typescript
it("rejects an academic year whose end date precedes its start", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(<AcademicYearsView initialYears={[]} />);

  await userEvent.type(screen.getByLabelText("Name"), "2026-27");
  await userEvent.type(screen.getByLabelText("Start date"), "2027-03-31");
  await userEvent.type(screen.getByLabelText("End date"), "2026-04-01");
  await userEvent.click(screen.getByRole("button", { name: /create academic year/i }));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText(/start date must be before/i)).toBeInTheDocument();
});

it("rejects a negative fee amount", async () => {
  // ...FeesView, amount "-100"
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects a period whose end time precedes its start", async () => {
  // ...PeriodsView, start "10:00", end "09:00"
  expect(fetchMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/format.test.ts tests/send-otp.test.ts`

Expected: `format.test.ts` fails (no module); `send-otp.test.ts` **passes immediately** — that is the point, it documents behaviour that is already correct.

- [ ] **Step 3: Write `src/lib/format.ts`**

```typescript
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDate(date)}, ${date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
```

`en-IN` matches `formatMoney` from Phase 5. The em dash for null is what stops a missing date rendering as "Invalid Date" or an empty cell.

- [ ] **Step 4: Apply the formatter**

```bash
grep -rn "toISOString\|toLocaleDateString" src/components src/app
```

Replace each display-side use with `formatDate` or `formatDateTime`. **Do not** touch `toISOString().slice(0, 10)` calls that feed a `type="date"` input or a request body — those need the ISO form and breaking them silently breaks every date field in the product.

- [ ] **Step 5: Add the missing client validation**

Five views. Each gets its checks immediately before the `fetch`, following the pattern `AssignmentsView` already uses:

- **Academic Years** — start before end, name non-empty.
- **Fees** — amount `> 0`, due date present.
- **Marks** — covered by Phase 4 Task 5; if that has not landed, add the marks-within-max check here.
- **Periods** — start time before end time, label non-empty.
- **Classes** — section non-empty; capacity `> 0` when set.

Set the same `error` state each view already renders. Do not introduce a new error display mechanism.

- [ ] **Step 6: Comment the login page**

Above the `testOtp` state in `src/app/login/page.tsx`:

```typescript
  // `testOtp` is only ever non-null when the server chose to return the code,
  // which it does exclusively when EXPOSE_OTP_FOR_TESTING === "true"
  // (see src/app/api/auth/send-otp/route.ts and src/lib/auth/send-otp.ts).
  // In production the field is absent and this affordance never renders.
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -20`

- [ ] **Step 8: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 9: Commit**

```bash
git add src/lib/format.ts src/components src/app tests
git commit -m "fix(ui): consistent client validation and date formatting"
```

---

### Task 9: Remove the stub pages from navigation

Four pages render `<ComingSoon />`: `dashboard/notifications`, `dashboard/reports`, `dashboard/resources`, `dashboard/settings` (for teacher and accountant), plus `parent/settings`. Three are linked from `WORKSPACE_NAV_ITEMS` for every role that can see them. A navigation entry leading to a placeholder is worse than no entry.

Separately: `dashboard/academic-years/promote` is a **real** page that is unreachable from the navigation — it is only linked from inside the academic years view.

Per the spec: `reports` and `resources` are de-linked rather than built, because they are net-new product modules and not remediation. `settings` becomes real for teacher and accountant. `notifications` becomes real, because Task 3's routing needs somewhere to route and `type`/`relatedId` are already stored.

**Files:**
- Modify: `apps/web/src/lib/data/nav-items.ts`
- Modify: `apps/web/src/app/dashboard/settings/page.tsx`, `dashboard/notifications/page.tsx`
- Delete: `apps/web/src/app/dashboard/reports/page.tsx`, `dashboard/resources/page.tsx`
- Test: `apps/web/tests/nav-items.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

```typescript
it("offers no navigation entry that leads to a placeholder", () => {
  for (const role of ["admin", "teacher", "accountant"] as const) {
    const items = getNavItemsForRole(role);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/dashboard/reports");
    expect(hrefs).not.toContain("/dashboard/resources");
  }
});

it("still offers notifications and settings to every dashboard role", () => {
  for (const role of ["admin", "teacher", "accountant"] as const) {
    const hrefs = getNavItemsForRole(role).map((i) => i.href);
    expect(hrefs).toContain("/dashboard/notifications");
    expect(hrefs).toContain("/dashboard/settings");
  }
});

it("links the promotion wizard for admins", () => {
  const hrefs = getNavItemsForRole("admin").map((i) => i.href);
  expect(hrefs).toContain("/dashboard/academic-years/promote");
});
```

Check whether `getNavItemsForRole` returns `WORKSPACE_NAV_ITEMS` merged in or separately, and adjust the assertions to match how the layout actually composes them.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/nav-items.test.ts`

- [ ] **Step 3: Trim the nav**

In `src/lib/data/nav-items.ts`:

```typescript
export const WORKSPACE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/notifications", label: "Notifications", icon: "Bell" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
];
```

Add the promotion wizard to `ALL_NAV_ITEMS` and to the admin href list:

```typescript
  { href: "/dashboard/academic-years/promote", label: "Promotion", icon: "CalendarRange" },
```

- [ ] **Step 4: Delete the two stub pages**

```bash
rm -r src/app/dashboard/reports src/app/dashboard/resources
```

Deleting rather than leaving them unlinked: an unreferenced route is still reachable by URL and still ships in the bundle. If the product wants them back, the git history has them.

Check nothing else links to them: `grep -rn "dashboard/reports\|dashboard/resources" src/`

- [ ] **Step 5: Make settings real for teacher and accountant**

`dashboard/settings/page.tsx` currently renders `SchoolProfileSettings` for admins and `<ComingSoon />` for everyone else. Give the other two roles a minimal real page: their own name, phone, email and role, read-only, plus a sign-out control. That is genuinely all the settings a teacher has in this product, and showing it honestly beats promising more.

- [ ] **Step 6: Make the notifications page real**

`dashboard/notifications/page.tsx` renders `<ComingSoon />`. Replace it with a list of the signed-in user's notifications — title, body, relative time, read state — reusing the query that `NotificationBell` already uses and Task 3's `notificationHref` for each row's link. A full page rather than a dropdown, with no unread cap.

Extract `notificationHref` from `NotificationBell.tsx` into a shared module so both use one copy.

- [ ] **Step 7: Handle `parent/settings`**

Same treatment as the dashboard: a real minimal page showing the parent's own name, phone and linked children, plus sign-out. Check whether it is linked from the parent navigation and de-link it if it stays a stub.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/nav-items.test.ts && npm test 2>&1 | tail -20`

- [ ] **Step 9: Verify nothing is orphaned**

Run: `grep -rn "ComingSoon" src/`

Every remaining hit must be a page that is **not** in any nav list. If `ComingSoon` has no remaining users at all, delete the component too.

- [ ] **Step 10: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 11: Commit**

```bash
git add -A src/lib/data/nav-items.ts src/app src/components tests
git commit -m "feat(nav): remove stub pages and build notifications and settings"
```

---

## Phase 8 Exit Criteria

- [ ] Every admin dialog announces itself as a modal dialog with an accessible name, traps Tab, and returns focus to its trigger — Escape and backdrop click still close it.
- [ ] Every mutating button in the product is disabled while its request is in flight, and re-enables after a failure as well as a success.
- [ ] Clicking an assignment notification opens that assignment, not the list; an unknown type lands on the overview rather than the homework list.
- [ ] Switching child from Attendance, Marks or Fees stays on that section; from a detail page it drops the record id.
- [ ] Two classes named "Grade 5 · A" in different years filter independently.
- [ ] Staff and Students have search and pagination matching the Classes implementation, and searching resets to page 1.
- [ ] Deactivate is available without first attempting a delete; an inactive record offers Activate instead.
- [ ] Fees, Marks, Periods, Academic Years and Classes all validate client-side before submitting.
- [ ] `grep -rn "toISOString\|toLocaleDateString" src/components src/app` returns only ISO uses that feed inputs or request bodies.
- [ ] `sendOtp` returns no code unless `exposeCodeForTesting` is true, asserted by a test.
- [ ] No navigation entry leads to a placeholder; `grep -rn "ComingSoon" src/` returns nothing reachable from any nav list.
- [ ] `git diff main --stat -- apps/web/prisma/` shows no change from this phase.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm test` all clean.

## What Phase 8 deliberately leaves open

- **Reports and Resources are deleted, not built.** Both are net-new modules. Recorded as product backlog; the git history holds the placeholder routes.
- **No global year selector.** Every operational page still resolves the active year server-side, so past years cannot be browsed. Deferred in the spec — it needs the year-selector concept the deferred decisions would settle.
- **Parents still cannot see the timetable or syllabus.** Both are fully modelled and stored; only the pages are missing. Deferred alongside the year selector.
- **Modal focus trap does not handle content added after mount.** The focusable list is queried per keystroke, so dynamically-added inputs are picked up — but an element that renders outside the panel via a portal would escape it. Nothing in this codebase does that today.

## Addendum: follow-ups surfaced by Phase 7b's final review, not in scope for this phase

Phase 7b's final whole-branch review (2026-08-23) found three items outside this plan's scope (Phase 8 is about frontend defects — accessibility, loading states, navigation bugs — not schema/form completeness gaps). None blocked Phase 7b's merge. Recording them here since this is the last planned phase in the remediation and there's nowhere else for them to land:

1. **`Subject` metadata (code, credit hours, weekly periods, practical, elective — added Phase 7a, exposed-on-create-only Phase 7b) has no edit path at all.** There is no `editSubject` function and no `PATCH /api/subjects/[id]` route (only `DELETE` exists). Adding one would require a new service function, which Phase 7b's Global Constraints explicitly reserved as a one-time exception for `updateSchoolProfile` — so it was correctly left out of that phase. Every OTHER field family Phase 7a/7b touched (student admission, staff HR, class capacity/room, school profile) got both create and edit; subjects are the one exception.
2. **Four near-identical file-upload API routes now exist** (`/api/assignments/upload`, `/api/staff/upload-photo`, `/api/students/upload-photo`, `/api/subjects/upload`) with no shared helper. The last one (staff photo upload, added in Phase 7b Task 3) was a plan deviation — that task's own brief explicitly said to reuse the existing student-photo upload flow rather than build a second one, and a near-duplicate was built anyway. Functionally harmless (both routes work correctly), but worth consolidating into one parameterized handler (allowed MIME map, size cap, subdirectory, response shape) before a fifth copy appears.
3. **No optional field exposed by Phase 7a/7b can be cleared back to empty on any EDIT path except the school profile.** `editStudent`/`editStaff`/`editClass` all do `if (fields.x !== undefined) data.x = fields.x` with no empty-string-to-null conversion, and their UI callers additionally guard with `if (fields.x)` before even including the field in the request — so once an admin sets a wrong blood group, designation, room, or capacity, there is no way to blank it back out short of direct DB access. `updateSchoolProfile` (Task 6) is the one implementation that gets this right (sends the raw typed value including empty string; the service converts empty-to-null). Recommend picking one convention — most likely Task 6's — and applying it uniformly across every edit path this remediation touched, or explicitly deciding "edit never clears" is the intended product behavior and documenting that instead of leaving the current unintentional-looking split.
