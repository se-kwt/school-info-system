# Staff & Students Card Rebuild + Sidebar Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the table-based Staff and Students admin pages with card grids + a click-to-open detail/edit popup, add header filters (role for Staff, class for Students) and pill-styled "Add new" buttons, and add a collapsible sidebar to the dashboard shell.

**Architecture:** Pure UI rebuild. No schema, API route, or `lib/school-setup/*` changes — every field and endpoint used below already exists and is exercised unchanged (`/api/staff/*`, `/api/students/*` including `upload-photo`). Each entity (Staff, Students) gets a small presentational card component and a modal component that owns its own form state and reports assembled field values upward via an `onSave` callback; the top-level `StaffView`/`StudentsView` components keep owning data-fetching, list state, and the create/edit/delete/deactivate/activate `fetch` calls, exactly as they do today — only the rendering layer changes. The sidebar becomes a single client component (`Sidebar.tsx`) so its collapse state and `localStorage` persistence can live in one place; `dashboard/layout.tsx` shrinks to just fetching data and rendering it.

**Tech Stack:** Next.js 14 (App Router), React (client components), Tailwind CSS, `lucide-react` for icons, Vitest + `@testing-library/react` + `@testing-library/user-event` with `// @vitest-environment jsdom`, following the exact test patterns already in `tests/attendance-review-panel.test.tsx` and `tests/students-view.test.tsx`.

## Global Constraints

- No changes to any file under `apps/web/src/lib/school-setup/`, `apps/web/src/app/api/staff/`, or `apps/web/src/app/api/students/` — all backend behavior is reused as-is.
- No changes to `apps/web/src/app/dashboard/staff/page.tsx` or `apps/web/src/app/dashboard/students/page.tsx` — both already pass exactly the props (`initialStaff`/`initialStudents`, `classes`, `currentUserId`/`isAdmin`) the rebuilt views need.
- Staff avatars are initials-only (no photo upload for staff) — matches the approved spec, no `User.photoUrl` field exists or is added.
- Every new interactive element gets an `aria-label` or accessible name so tests can query by role/label, matching the existing codebase convention (see `StudentsView.tsx`'s `aria-label="Student name"` etc.).
- Pill buttons use `rounded-full`; the existing codebase's pill/save button convention is `className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"` (copied verbatim from `AttendanceReviewPanel.tsx`'s "Confirm & Submit" button) — reuse this exact className for every Save pill button in this plan.
- Modal backdrop convention: `className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"` with an inner panel `className="... rounded-2xl bg-white p-5 shadow-xl"` — copied from `AttendanceReviewPanel.tsx`, reused via the new shared `Modal` component.
- Run `cd apps/web && npx vitest run <file>` after every test-writing step; run the full `cd apps/web && npx vitest run` before the final commit of each task that touches shared files.

---

## Task 1: Shared `Modal` shell + `StaffCard`

**Files:**
- Create: `apps/web/src/components/school-setup/Modal.tsx`
- Create: `apps/web/src/components/school-setup/StaffCard.tsx`
- Test: `apps/web/tests/modal.test.tsx`
- Test: `apps/web/tests/staff-card.test.tsx`

**Interfaces produced:**
- `Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void })` — backdrop + Escape-key + backdrop-click all call `onClose`; clicking inside the panel does not.
- `StaffCard({ member, onClick }: { member: StaffRow; onClick: () => void })` where `StaffRow` is `{ id: number; name: string; phone: string; role: "teacher" | "admin" | "accountant"; status: "active" | "inactive"; classAssignment: { className: string; section: string; subject: string } | null }`.

- [ ] **Step 1: Write the failing tests for `Modal`**

Create `apps/web/tests/modal.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../src/components/school-setup/Modal";

describe("Modal", () => {
  afterEach(() => cleanup());

  it("renders its children", () => {
    render(
      <Modal onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    await userEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the panel content is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    await userEvent.click(screen.getByText("Modal content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/modal.test.tsx`
Expected: FAIL with "Failed to resolve import ../src/components/school-setup/Modal" (file doesn't exist yet).

- [ ] **Step 3: Implement `Modal`**

Create `apps/web/src/components/school-setup/Modal.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/modal.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing tests for `StaffCard`**

Create `apps/web/tests/staff-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffCard } from "../src/components/school-setup/StaffCard";

describe("StaffCard", () => {
  afterEach(() => cleanup());

  const teacher = {
    id: 1,
    name: "Jane Teacher",
    phone: "+15550001111",
    role: "teacher" as const,
    status: "active" as const,
    classAssignment: { className: "Grade 5", section: "A", subject: "Math" },
  };

  it("renders the name and capitalized role", () => {
    render(<StaffCard member={teacher} onClick={() => {}} />);
    expect(screen.getByText("Jane Teacher")).toBeInTheDocument();
    expect(screen.getByText("teacher")).toBeInTheDocument();
  });

  it("renders the class assignment line for a teacher with an assignment", () => {
    render(<StaffCard member={teacher} onClick={() => {}} />);
    expect(screen.getByText("Grade 5 A · Math")).toBeInTheDocument();
  });

  it("omits the class assignment line when there is none", () => {
    render(<StaffCard member={{ ...teacher, classAssignment: null }} onClick={() => {}} />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("shows an Inactive badge when status is inactive", () => {
    render(<StaffCard member={{ ...teacher, status: "inactive" }} onClick={() => {}} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("does not show an Inactive badge when status is active", () => {
    render(<StaffCard member={teacher} onClick={() => {}} />);
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<StaffCard member={teacher} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Jane Teacher/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/staff-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `StaffCard`**

Create `apps/web/src/components/school-setup/StaffCard.tsx`:

```tsx
"use client";

type Role = "teacher" | "admin" | "accountant";

export interface StaffRow {
  id: number;
  name: string;
  phone: string;
  role: Role;
  status: "active" | "inactive";
  classAssignment: { className: string; section: string; subject: string } | null;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function StaffCard({ member, onClick }: { member: StaffRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View details for ${member.name}`}
      className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition-all hover:border-neutral-300 hover:shadow-sm"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-sm font-bold text-neutral-600">
        {initials(member.name)}
      </span>
      <span className="text-xs font-semibold text-neutral-800">{member.name}</span>
      <span className="text-[11px] capitalize text-neutral-400">{member.role}</span>
      {member.role === "teacher" && member.classAssignment && (
        <span className="text-[11px] text-neutral-400">
          {member.classAssignment.className} {member.classAssignment.section} ·{" "}
          {member.classAssignment.subject}
        </span>
      )}
      {member.status === "inactive" && (
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
          Inactive
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/staff-card.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/school-setup/Modal.tsx apps/web/src/components/school-setup/StaffCard.tsx apps/web/tests/modal.test.tsx apps/web/tests/staff-card.test.tsx
git commit -m "Add shared Modal shell and StaffCard component"
```

---

## Task 2: `StaffDetailModal`

**Files:**
- Create: `apps/web/src/components/school-setup/StaffDetailModal.tsx`
- Test: `apps/web/tests/staff-detail-modal.test.tsx`

**Interfaces consumed:** `Modal` (Task 1), `StaffRow` (Task 1, re-exported from `StaffCard.tsx`).

**Interfaces produced:**
- `SaveStaffFields = { name: string; phone: string; role: Role; classId: number | null; subject: string | null }`
- `StaffDetailModal(props: StaffDetailModalProps)` where:

```ts
interface StaffDetailModalProps {
  mode: "create" | "edit";
  staff?: StaffRow;
  classes: { id: number; name: string; section: string }[];
  isSelf: boolean;
  serverError: string | null;
  deleteBlocked: boolean;
  onClose: () => void;
  onSave: (fields: SaveStaffFields) => void;
  onDelete: () => void;
  onDeactivate: () => void;
  onCancelDelete: () => void;
  onActivate: () => void;
}
```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/staff-detail-modal.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffDetailModal } from "../src/components/school-setup/StaffDetailModal";

const classes = [{ id: 1, name: "Grade 5", section: "A" }];

const existingStaff = {
  id: 2,
  name: "Jane Teacher",
  phone: "+15550001111",
  role: "teacher" as const,
  status: "active" as const,
  classAssignment: { className: "Grade 5", section: "A", subject: "Math" },
};

function noop() {}

describe("StaffDetailModal", () => {
  afterEach(() => cleanup());

  it("create mode: renders blank fields and calls onSave with assembled fields", async () => {
    const onSave = vi.fn();
    render(
      <StaffDetailModal
        mode="create"
        classes={classes}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={onSave}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );

    await userEvent.type(screen.getByLabelText("Name"), "New Teacher");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559998888");
    await userEvent.selectOptions(screen.getByLabelText("Class assignment"), "1");
    await userEvent.type(screen.getByLabelText("Subject"), "Science");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "New Teacher",
      phone: "+15559998888",
      role: "teacher",
      classId: 1,
      subject: "Science",
    });
  });

  it("create mode: role other than teacher hides class/subject fields and sends null classId", async () => {
    const onSave = vi.fn();
    render(
      <StaffDetailModal
        mode="create"
        classes={classes}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={onSave}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );

    await userEvent.type(screen.getByLabelText("Name"), "New Admin");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559998888");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    expect(screen.queryByLabelText("Class assignment")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "New Admin",
      phone: "+15559998888",
      role: "admin",
      classId: null,
      subject: null,
    });
  });

  it("edit mode: pre-fills fields from the staff prop", () => {
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
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

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Jane Teacher");
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("+15550001111");
  });

  it("edit mode: hides Delete when isSelf is true", () => {
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
        isSelf={true}
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
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("edit mode: clicking Delete calls onDelete", async () => {
    const onDelete = vi.fn();
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={onDelete}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("edit mode: when deleteBlocked, shows Deactivate instead and Cancel", async () => {
    const onDeactivate = vi.fn();
    const onCancelDelete = vi.fn();
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
        isSelf={false}
        serverError={null}
        deleteBlocked={true}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={onDeactivate}
        onCancelDelete={onCancelDelete}
        onActivate={noop}
      />
    );
    expect(screen.getByText(/has recorded activity/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deactivate instead" }));
    expect(onDeactivate).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelDelete).toHaveBeenCalledTimes(1);
  });

  it("edit mode: shows Activate button for an inactive staff member and calls onActivate", async () => {
    const onActivate = vi.fn();
    render(
      <StaffDetailModal
        mode="edit"
        staff={{ ...existingStaff, status: "inactive" }}
        classes={classes}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={onActivate}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("renders a server error message when provided", () => {
    render(
      <StaffDetailModal
        mode="create"
        classes={classes}
        isSelf={false}
        serverError="This phone number is already registered"
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    expect(screen.getByText("This phone number is already registered")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/staff-detail-modal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StaffDetailModal`**

Create `apps/web/src/components/school-setup/StaffDetailModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { StaffRow } from "./StaffCard";

type Role = "teacher" | "admin" | "accountant";

export interface SaveStaffFields {
  name: string;
  phone: string;
  role: Role;
  classId: number | null;
  subject: string | null;
}

export function StaffDetailModal({
  mode,
  staff,
  classes,
  isSelf,
  serverError,
  deleteBlocked,
  onClose,
  onSave,
  onDelete,
  onDeactivate,
  onCancelDelete,
  onActivate,
}: {
  mode: "create" | "edit";
  staff?: StaffRow;
  classes: { id: number; name: string; section: string }[];
  isSelf: boolean;
  serverError: string | null;
  deleteBlocked: boolean;
  onClose: () => void;
  onSave: (fields: SaveStaffFields) => void;
  onDelete: () => void;
  onDeactivate: () => void;
  onCancelDelete: () => void;
  onActivate: () => void;
}) {
  const [name, setName] = useState(staff?.name ?? "");
  const [phone, setPhone] = useState(staff?.phone ?? "");
  const [role, setRole] = useState<Role>(staff?.role ?? "teacher");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState(staff?.classAssignment?.subject ?? "");

  function handleSave() {
    onSave({
      name,
      phone,
      role,
      classId: role === "teacher" && classId ? Number(classId) : null,
      subject: role === "teacher" && classId ? subject : null,
    });
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new staff" : staff?.name}
      </h2>

      <div className="flex flex-col gap-2">
        <input
          type="text"
          aria-label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Name"
        />
        <input
          type="tel"
          aria-label="Phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Phone number"
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
        </select>
        {role === "teacher" && (
          <>
            <select
              aria-label="Class assignment"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">No class assignment</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name} {klass.section}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Subject (required if assigning a class)"
            />
          </>
        )}
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {mode === "edit" && !isSelf && !deleteBlocked && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-all hover:bg-red-50"
            >
              Delete
            </button>
          )}
          {mode === "edit" && staff?.status === "inactive" && (
            <button
              type="button"
              onClick={onActivate}
              className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-50"
            >
              Activate
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Save
        </button>
      </div>

      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{staff?.name} has recorded activity and cannot be permanently deleted.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onDeactivate}
              className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white"
            >
              Deactivate instead
            </button>
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/staff-detail-modal.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/StaffDetailModal.tsx apps/web/tests/staff-detail-modal.test.tsx
git commit -m "Add StaffDetailModal"
```

---

## Task 3: Rewrite `StaffView` as a card grid with header filter + Add new staff

**Files:**
- Modify: `apps/web/src/components/school-setup/StaffView.tsx` (full rewrite)
- Create: `apps/web/tests/staff-view.test.tsx`

**Interfaces consumed:** `StaffCard`, `StaffRow` (Task 1), `StaffDetailModal`, `SaveStaffFields` (Task 2). Same props as today: `{ initialStaff: StaffRow[]; classes: { id: number; name: string; section: string }[]; currentUserId: number }` (unchanged — `apps/web/src/app/dashboard/staff/page.tsx` needs no edits).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/staff-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffView } from "../src/components/school-setup/StaffView";

const classes = [{ id: 1, name: "Grade 5", section: "A" }];

const staff = [
  {
    id: 1,
    name: "Current Admin",
    phone: "+15550000001",
    role: "admin" as const,
    status: "active" as const,
    classAssignment: null,
  },
  {
    id: 2,
    name: "Jane Teacher",
    phone: "+15550001111",
    role: "teacher" as const,
    status: "active" as const,
    classAssignment: { className: "Grade 5", section: "A", subject: "Math" },
  },
];

describe("StaffView", () => {
  afterEach(() => cleanup());

  it("renders one card per staff member", () => {
    render(<StaffView initialStaff={staff} classes={classes} currentUserId={1} />);
    expect(screen.getByText("Current Admin")).toBeInTheDocument();
    expect(screen.getByText("Jane Teacher")).toBeInTheDocument();
  });

  it("filters the grid by role", async () => {
    render(<StaffView initialStaff={staff} classes={classes} currentUserId={1} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by role"), "teacher");
    expect(screen.queryByText("Current Admin")).not.toBeInTheDocument();
    expect(screen.getByText("Jane Teacher")).toBeInTheDocument();
  });

  it("opens the create modal from Add new staff and posts on Save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Person", phone: "+15559997777" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(staff), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={staff} classes={classes} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Add new staff" }));
    await userEvent.type(screen.getByLabelText("Name"), "New Person");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559997777");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "accountant");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/staff", expect.objectContaining({ method: "POST" }));
    });
  });

  it("opens an existing card and PATCHes on Save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(staff), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={staff} classes={classes} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Jane Teacher/ }));
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Jane T. Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/staff/2", expect.objectContaining({ method: "PATCH" }));
    });
  });

  it("shows the deactivate fallback when delete is blocked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "blocked", deletable: false }), { status: 400 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(staff), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={staff} classes={classes} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Jane Teacher/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/has recorded activity/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deactivate instead" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/staff/2/deactivate",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });

  it("hides Delete on the current user's own card", async () => {
    render(<StaffView initialStaff={staff} classes={classes} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Current Admin/ }));
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/staff-view.test.tsx`
Expected: FAIL — current `StaffView` has no "Filter by role" label, no "Add new staff" button, cards aren't buttons named after the member.

- [ ] **Step 3: Rewrite `StaffView`**

Replace `apps/web/src/components/school-setup/StaffView.tsx` entirely with:

```tsx
"use client";

import { useState } from "react";
import { StaffCard, type StaffRow } from "./StaffCard";
import { StaffDetailModal, type SaveStaffFields } from "./StaffDetailModal";

type Role = "teacher" | "admin" | "accountant";
type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;

export function StaffView({
  initialStaff,
  classes,
  currentUserId,
}: {
  initialStaff: StaffRow[];
  classes: { id: number; name: string; section: string }[];
  currentUserId: number;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [modalState, setModalState] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  const filteredStaff = roleFilter === "all" ? staff : staff.filter((member) => member.role === roleFilter);

  async function refresh() {
    const response = await fetch("/api/staff");
    setStaff(await response.json());
  }

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

  function closeModal() {
    setModalState(null);
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSave(fields: SaveStaffFields) {
    setError(null);
    if (modalState?.mode === "create") {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          phone: fields.phone,
          role: fields.role,
          classId: fields.classId ?? undefined,
          subject: fields.subject ?? undefined,
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
      const response = await fetch(`/api/staff/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          phone: fields.phone,
          role: fields.role,
          classId: fields.classId,
          subject: fields.subject,
        }),
      });
      if (response.ok) {
        await refresh();
        closeModal();
        return;
      }
      setError((await response.json()).error);
    }
  }

  async function handleDelete() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/staff/${modalState.id}`, { method: "DELETE" });
    if (response.ok) {
      await refresh();
      closeModal();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(modalState.id);
      return;
    }
    setError(body.error);
  }

  async function handleDeactivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/staff/${modalState.id}/deactivate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
    closeModal();
  }

  async function handleActivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/staff/${modalState.id}/activate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  const editingStaff = modalState?.mode === "edit" ? staff.find((member) => member.id === modalState.id) : undefined;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as "all" | Role)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All roles</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
        </select>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Add new staff
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filteredStaff.map((member) => (
          <StaffCard key={member.id} member={member} onClick={() => openEdit(member.id)} />
        ))}
      </div>

      {modalState && (
        <StaffDetailModal
          mode={modalState.mode}
          staff={editingStaff}
          classes={classes}
          isSelf={modalState.mode === "edit" && modalState.id === currentUserId}
          serverError={error}
          deleteBlocked={modalState.mode === "edit" && deleteBlockedId === modalState.id}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onDeactivate={handleDeactivate}
          onCancelDelete={() => setDeleteBlockedId(null)}
          onActivate={handleActivate}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/staff-view.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `cd apps/web && npx vitest run`
Expected: all pass, including `tests/staff-api.test.ts` (untouched backend) and the earlier Task 1/2 test files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/school-setup/StaffView.tsx apps/web/tests/staff-view.test.tsx
git commit -m "Rebuild StaffView as a card grid with role filter and detail modal"
```

---

## Task 4: `StudentCard`

**Files:**
- Create: `apps/web/src/components/school-setup/StudentCard.tsx`
- Test: `apps/web/tests/student-card.test.tsx`

**Interfaces produced:**

```ts
export interface StudentRow {
  id: number;
  name: string;
  admissionNo: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: "active" | "left" | "transferred" | "graduated" | "inactive";
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}
```

`StudentCard({ student, onClick }: { student: StudentRow; onClick: () => void })`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/student-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentCard } from "../src/components/school-setup/StudentCard";

describe("StudentCard", () => {
  afterEach(() => cleanup());

  const student = {
    id: 1,
    name: "Rohan Sharma",
    admissionNo: "SCH-1",
    rollNumber: "5",
    photoUrl: null,
    status: "active" as const,
    class: { name: "Grade 5", section: "A" },
    parents: [],
  };

  it("renders the name, roll number, and class", () => {
    render(<StudentCard student={student} onClick={() => {}} />);
    expect(screen.getByText("Rohan Sharma")).toBeInTheDocument();
    expect(screen.getByText("Roll No. 5")).toBeInTheDocument();
    expect(screen.getByText("Grade 5 A")).toBeInTheDocument();
  });

  it("renders initials when there is no photo", () => {
    render(<StudentCard student={student} onClick={() => {}} />);
    expect(screen.getByText("RS")).toBeInTheDocument();
  });

  it("renders a photo image when photoUrl is set", () => {
    render(<StudentCard student={{ ...student, photoUrl: "/uploads/students/a.png" }} onClick={() => {}} />);
    expect(screen.getByAltText("Rohan Sharma")).toHaveAttribute("src", "/uploads/students/a.png");
  });

  it("shows a status badge when not active", () => {
    render(<StudentCard student={{ ...student, status: "inactive" }} onClick={() => {}} />);
    expect(screen.getByText("inactive")).toBeInTheDocument();
  });

  it("does not show a status badge when active", () => {
    render(<StudentCard student={student} onClick={() => {}} />);
    expect(screen.queryByText("active")).not.toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<StudentCard student={student} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Rohan Sharma/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/student-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StudentCard`**

Create `apps/web/src/components/school-setup/StudentCard.tsx`:

```tsx
"use client";

export interface StudentRow {
  id: number;
  name: string;
  admissionNo: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: "active" | "left" | "transferred" | "graduated" | "inactive";
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function StudentCard({ student, onClick }: { student: StudentRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View details for ${student.name}`}
      className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition-all hover:border-neutral-300 hover:shadow-sm"
    >
      {student.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={student.photoUrl} alt={student.name} className="h-14 w-14 rounded-full object-cover" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-sm font-bold text-neutral-600">
          {initials(student.name)}
        </span>
      )}
      <span className="text-xs font-semibold text-neutral-800">{student.name}</span>
      {student.rollNumber && <span className="text-[11px] text-neutral-400">Roll No. {student.rollNumber}</span>}
      <span className="text-[11px] text-neutral-400">
        {student.class ? `${student.class.name} ${student.class.section}` : "Unassigned"}
      </span>
      {student.status !== "active" && (
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
          {student.status}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/student-card.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/StudentCard.tsx apps/web/tests/student-card.test.tsx
git commit -m "Add StudentCard component"
```

---

## Task 5: `StudentDetailModal`

**Files:**
- Create: `apps/web/src/components/school-setup/StudentDetailModal.tsx`
- Test: `apps/web/tests/student-detail-modal.test.tsx`

**Interfaces consumed:** `Modal` (Task 1), `StudentRow` (Task 4).

**Interfaces produced:**

```ts
export interface SaveStudentFields {
  name: string;
  dob: string;
  admissionNo: string;
  rollNumber: string;
  classId: number | null;
  photoFile: File | null;
  parentPhone: string;
  parentName: string;
}
```

`StudentDetailModal(props: StudentDetailModalProps)`:

```ts
interface StudentDetailModalProps {
  mode: "create" | "edit";
  student?: StudentRow;
  classes: { id: number; name: string; section: string }[];
  isAdmin: boolean;
  defaultClassId?: number;
  serverError: string | null;
  deleteBlocked: boolean;
  onClose: () => void;
  onSave: (fields: SaveStudentFields) => void;
  onDelete: () => void;
  onDeactivate: () => void;
  onCancelDelete: () => void;
  onActivate: () => void;
}
```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/student-detail-modal.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentDetailModal } from "../src/components/school-setup/StudentDetailModal";

const classes = [
  { id: 1, name: "Grade 5", section: "A" },
  { id: 2, name: "Grade 6", section: "B" },
];

const existingStudent = {
  id: 1,
  name: "Rohan Sharma",
  admissionNo: "SCH-1",
  rollNumber: "5",
  photoUrl: null,
  status: "active" as const,
  class: { name: "Grade 5", section: "A" },
  parents: [],
};

function noop() {}

describe("StudentDetailModal", () => {
  afterEach(() => cleanup());

  it("create mode: renders all create fields and assembles fields on Save", async () => {
    const onSave = vi.fn();
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        isAdmin={true}
        defaultClassId={2}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={onSave}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );

    await userEvent.type(screen.getByLabelText("Name"), "New Student");
    await userEvent.type(screen.getByLabelText("Date of birth"), "2016-01-01");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-2");
    await userEvent.type(screen.getByLabelText("Roll number"), "9");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "New Student",
      dob: "2016-01-01",
      admissionNo: "SCH-2",
      rollNumber: "9",
      classId: 2,
      photoFile: null,
      parentPhone: "+15550009999",
      parentName: "A Parent",
    });
  });

  it("create mode: uploading a photo includes it as photoFile on Save", async () => {
    const onSave = vi.fn();
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        isAdmin={true}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={onSave}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Photo"), file);
    await userEvent.type(screen.getByLabelText("Name"), "New Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-2");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0].photoFile).toBe(file);
  });

  it("edit mode: pre-fills fields and hides parent fields", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={existingStudent}
        classes={classes}
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
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Rohan Sharma");
    expect((screen.getByLabelText("Admission number") as HTMLInputElement).value).toBe("SCH-1");
    expect(screen.queryByLabelText("Parent phone")).not.toBeInTheDocument();
  });

  it("edit mode: hides the class dropdown when the student has no active enrollment", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={{ ...existingStudent, class: null }}
        classes={classes}
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
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
  });

  it("non-admin: hides Save and Delete", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={existingStudent}
        classes={classes}
        isAdmin={false}
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
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("edit mode: deleteBlocked shows Deactivate instead and Cancel", async () => {
    const onDeactivate = vi.fn();
    const onCancelDelete = vi.fn();
    render(
      <StudentDetailModal
        mode="edit"
        student={existingStudent}
        classes={classes}
        isAdmin={true}
        serverError={null}
        deleteBlocked={true}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={onDeactivate}
        onCancelDelete={onCancelDelete}
        onActivate={noop}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Deactivate instead" }));
    expect(onDeactivate).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelDelete).toHaveBeenCalledTimes(1);
  });

  it("edit mode: shows Activate for a non-active student and calls onActivate", async () => {
    const onActivate = vi.fn();
    render(
      <StudentDetailModal
        mode="edit"
        student={{ ...existingStudent, status: "inactive" }}
        classes={classes}
        isAdmin={true}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={onActivate}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/student-detail-modal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StudentDetailModal`**

Create `apps/web/src/components/school-setup/StudentDetailModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { StudentRow } from "./StudentCard";

export interface SaveStudentFields {
  name: string;
  dob: string;
  admissionNo: string;
  rollNumber: string;
  classId: number | null;
  photoFile: File | null;
  parentPhone: string;
  parentName: string;
}

export function StudentDetailModal({
  mode,
  student,
  classes,
  isAdmin,
  defaultClassId,
  serverError,
  deleteBlocked,
  onClose,
  onSave,
  onDelete,
  onDeactivate,
  onCancelDelete,
  onActivate,
}: {
  mode: "create" | "edit";
  student?: StudentRow;
  classes: { id: number; name: string; section: string }[];
  isAdmin: boolean;
  defaultClassId?: number;
  serverError: string | null;
  deleteBlocked: boolean;
  onClose: () => void;
  onSave: (fields: SaveStudentFields) => void;
  onDelete: () => void;
  onDeactivate: () => void;
  onCancelDelete: () => void;
  onActivate: () => void;
}) {
  const [name, setName] = useState(student?.name ?? "");
  const [dob, setDob] = useState("");
  const [admissionNo, setAdmissionNo] = useState(student?.admissionNo ?? "");
  const [rollNumber, setRollNumber] = useState(student?.rollNumber ?? "");
  const [classId, setClassId] = useState(
    mode === "create" ? String(defaultClassId ?? classes[0]?.id ?? "") : ""
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");

  const showClassField = mode === "create" || Boolean(student?.class);

  function handleSave() {
    onSave({
      name,
      dob,
      admissionNo,
      rollNumber,
      classId: classId ? Number(classId) : null,
      photoFile,
      parentPhone,
      parentName,
    });
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new student" : student?.name}
      </h2>

      <div className="flex flex-col gap-2">
        <input
          type="text"
          aria-label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!isAdmin}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Student name"
        />
        <input
          type="date"
          aria-label="Date of birth"
          value={dob}
          onChange={(event) => setDob(event.target.value)}
          disabled={!isAdmin}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          aria-label="Admission number"
          value={admissionNo}
          onChange={(event) => setAdmissionNo(event.target.value)}
          disabled={!isAdmin}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Admission number"
        />
        <input
          type="text"
          aria-label="Roll number"
          value={rollNumber}
          onChange={(event) => setRollNumber(event.target.value)}
          disabled={!isAdmin}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Roll number (optional)"
        />
        {isAdmin && (
          <input
            type="file"
            aria-label="Photo"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        )}
        {showClassField && (
          <select
            aria-label="Class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {mode === "edit" && <option value="">Keep current class</option>}
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name} {klass.section}
              </option>
            ))}
          </select>
        )}
        {mode === "create" && (
          <>
            <input
              type="tel"
              aria-label="Parent phone"
              value={parentPhone}
              onChange={(event) => setParentPhone(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Parent phone number"
            />
            <input
              type="text"
              aria-label="Parent name"
              value={parentName}
              onChange={(event) => setParentName(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Parent name (only if this phone is new)"
            />
          </>
        )}
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      {isAdmin && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {mode === "edit" && !deleteBlocked && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-all hover:bg-red-50"
              >
                Delete
              </button>
            )}
            {mode === "edit" && student?.status !== "active" && (
              <button
                type="button"
                onClick={onActivate}
                className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-50"
              >
                Activate
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Save
          </button>
        </div>
      )}

      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{student?.name} has recorded history and cannot be permanently deleted.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onDeactivate}
              className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white"
            >
              Deactivate instead
            </button>
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/student-detail-modal.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/StudentDetailModal.tsx apps/web/tests/student-detail-modal.test.tsx
git commit -m "Add StudentDetailModal"
```

---

## Task 6: Rewrite `StudentsView` as a card grid with class filter + Add new student

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx` (full rewrite)
- Modify: `apps/web/tests/students-view.test.tsx` (full rewrite)

**Interfaces consumed:** `StudentCard`, `StudentRow` (Task 4), `StudentDetailModal`, `SaveStudentFields` (Task 5). Same props as today: `{ initialStudents: StudentRow[]; classes: { id: number; name: string; section: string }[]; isAdmin: boolean }` (unchanged — `apps/web/src/app/dashboard/students/page.tsx` needs no edits).

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/tests/students-view.test.tsx` entirely with:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentsView } from "../src/components/school-setup/StudentsView";

const classes = [
  { id: 1, name: "Grade 5", section: "A" },
  { id: 2, name: "Grade 6", section: "B" },
];

const students = [
  {
    id: 1,
    name: "Existing Student",
    admissionNo: "SCH-1",
    rollNumber: "5",
    photoUrl: null,
    status: "active" as const,
    class: { name: "Grade 5", section: "A" },
    parents: [],
  },
  {
    id: 2,
    name: "Other Class Student",
    admissionNo: "SCH-2",
    rollNumber: "1",
    photoUrl: null,
    status: "active" as const,
    class: { name: "Grade 6", section: "B" },
    parents: [],
  },
];

describe("StudentsView", () => {
  afterEach(() => cleanup());

  it("shows all students by default", () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    expect(screen.getByText("Existing Student")).toBeInTheDocument();
    expect(screen.getByText("Other Class Student")).toBeInTheDocument();
  });

  it("filters the grid by the selected class", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by class"), "1");
    expect(screen.getByText("Existing Student")).toBeInTheDocument();
    expect(screen.queryByText("Other Class Student")).not.toBeInTheDocument();
  });

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

    await userEvent.type(screen.getByLabelText("Name"), "New Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-3");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");

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

  it("pre-fills the roll number when opening an existing card and submits it on save", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: /Existing Student/ }));

    const rollNumberInput = screen.getByLabelText("Roll number") as HTMLInputElement;
    expect(rollNumberInput.value).toBe("5");

    await userEvent.clear(rollNumberInput);
    await userEvent.type(rollNumberInput, "9");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/students/1", expect.objectContaining({ method: "PATCH" }));
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.rollNumber).toBe("9");
  });

  it("non-admin can open a card but sees no Save button", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: "Add new student" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Existing Student/ }));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/students-view.test.tsx`
Expected: FAIL — current `StudentsView` has no "Filter by class" label, no "Add new student" button-triggered modal, cards aren't named buttons.

- [ ] **Step 3: Rewrite `StudentsView`**

Replace `apps/web/src/components/school-setup/StudentsView.tsx` entirely with:

```tsx
"use client";

import { useState } from "react";
import { StudentCard, type StudentRow } from "./StudentCard";
import { StudentDetailModal, type SaveStudentFields } from "./StudentDetailModal";

type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;

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

export function StudentsView({
  initialStudents,
  classes,
  isAdmin,
}: {
  initialStudents: StudentRow[];
  classes: { id: number; name: string; section: string }[];
  isAdmin: boolean;
}) {
  const [students, setStudents] = useState(initialStudents);
  const [classFilter, setClassFilter] = useState("all");
  const [modalState, setModalState] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  const selectedClass = classFilter === "all" ? null : classes.find((klass) => String(klass.id) === classFilter);
  const filteredStudents =
    classFilter === "all"
      ? students
      : students.filter(
          (student) =>
            selectedClass && student.class?.name === selectedClass.name && student.class?.section === selectedClass.section
        );

  async function refresh() {
    const response = await fetch("/api/students");
    setStudents(await response.json());
  }

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

  function closeModal() {
    setModalState(null);
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSave(fields: SaveStudentFields) {
    setError(null);

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
          parentPhone: fields.parentPhone,
          parentName: fields.parentName || undefined,
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
      } = {
        name: fields.name,
        admissionNo: fields.admissionNo,
      };
      if (fields.dob) body.dob = fields.dob;
      if (fields.classId) body.classId = fields.classId;
      if (fields.rollNumber) body.rollNumber = fields.rollNumber;
      if (photoUrl) body.photoUrl = photoUrl;

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
  }

  async function handleDelete() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/students/${modalState.id}`, { method: "DELETE" });
    if (response.ok) {
      await refresh();
      closeModal();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(modalState.id);
      return;
    }
    setError(body.error);
  }

  async function handleDeactivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/students/${modalState.id}/deactivate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
    closeModal();
  }

  async function handleActivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/students/${modalState.id}/activate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  const editingStudent =
    modalState?.mode === "edit" ? students.find((student) => student.id === modalState.id) : undefined;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="Filter by class"
          value={classFilter}
          onChange={(event) => setClassFilter(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All classes</option>
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name} {klass.section}
            </option>
          ))}
        </select>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Add new student
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filteredStudents.map((student) => (
          <StudentCard key={student.id} student={student} onClick={() => openEdit(student.id)} />
        ))}
      </div>

      {modalState && (
        <StudentDetailModal
          mode={modalState.mode}
          student={editingStudent}
          classes={classes}
          isAdmin={isAdmin}
          defaultClassId={selectedClass?.id}
          serverError={error}
          deleteBlocked={modalState.mode === "edit" && deleteBlockedId === modalState.id}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onDeactivate={handleDeactivate}
          onCancelDelete={() => setDeleteBlockedId(null)}
          onActivate={handleActivate}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/students-view.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `cd apps/web && npx vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/school-setup/StudentsView.tsx apps/web/tests/students-view.test.tsx
git commit -m "Rebuild StudentsView as a card grid with class filter and detail modal"
```

---

## Task 7: Collapsible sidebar

**Files:**
- Create: `apps/web/src/components/dashboard/Sidebar.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx`
- Test: `apps/web/tests/sidebar.test.tsx`

**Interfaces consumed:** `NavItem` type from `apps/web/src/lib/dashboard/nav-items.ts` (`{ href: string; label: string; icon: LucideIcon }`).

**Interfaces produced:**

```ts
interface SidebarProps {
  navItems: NavItem[];
  workspaceItems: NavItem[];
  pinnedClasses: { id: number; name: string; section: string }[];
  userName: string;
  userInitials: string;
  userRole: string;
}
```

`Sidebar(props: SidebarProps)` — replaces the entire `<aside>` block currently inline in `dashboard/layout.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutDashboard, Bell } from "lucide-react";
import { Sidebar } from "../src/components/dashboard/Sidebar";

const navItems = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];
const workspaceItems = [{ href: "/dashboard/notifications", label: "Notifications", icon: Bell }];

describe("Sidebar", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("renders expanded by default with nav labels visible", () => {
    render(
      <Sidebar
        navItems={navItems}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
      />
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Jane Admin")).toBeInTheDocument();
  });

  it("collapses to icon-only when the toggle is clicked, hiding labels", async () => {
    render(
      <Sidebar
        navItems={navItems}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Jane Admin")).not.toBeInTheDocument();
  });

  it("persists the collapsed state to localStorage and restores it on remount", async () => {
    const { unmount } = render(
      <Sidebar
        navItems={navItems}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    unmount();

    render(
      <Sidebar
        navItems={navItems}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
      />
    );
    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/sidebar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Sidebar`**

Create `apps/web/src/components/dashboard/Sidebar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar({
  navItems,
  workspaceItems,
  pinnedClasses,
  userName,
  userInitials,
  userRole,
}: {
  navItems: NavItem[];
  workspaceItems: NavItem[];
  pinnedClasses: { id: number; name: string; section: string }[];
  userName: string;
  userInitials: string;
  userRole: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  const navLinkClass =
    "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition-all hover:bg-[#EAECF0]/30 hover:text-neutral-800";

  return (
    <aside
      className={`flex shrink-0 flex-col justify-between border-r border-neutral-200/70 bg-neutral-50/95 transition-all ${
        collapsed ? "w-16" : "w-[260px]"
      }`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs font-bold text-white">
              SI
            </div>
            {!collapsed && (
              <div>
                <p className="text-sm font-semibold tracking-tight text-neutral-900">School Info System</p>
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
        <div>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Main Menu
            </p>
          )}
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={navLinkClass} title={collapsed ? item.label : undefined}>
                    <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Workspace
            </p>
          )}
          <ul className="space-y-0.5">
            {workspaceItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={navLinkClass} title={collapsed ? item.label : undefined}>
                    <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

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
                    className={navLinkClass}
                    title={collapsed ? `${klass.name} ${klass.section}` : undefined}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-600">
                      {klass.name[0]}
                    </span>
                    {!collapsed && (
                      <span className="truncate">
                        {klass.name} {klass.section}
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

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/sidebar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `Sidebar` into `dashboard/layout.tsx`**

Replace `apps/web/src/app/dashboard/layout.tsx` entirely with:

```tsx
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
  const claims = requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const navItems = getNavItemsForRole(claims.role);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);

  const pinnedClasses =
    claims.role === "teacher"
      ? (await getClassesForTeacher(prisma, claims.userId, activeYear?.id ?? -1)).slice(0, 3)
      : claims.role === "admin"
        ? (await listClasses(prisma, claims.schoolId)).slice(0, 3)
        : [];

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <Sidebar
        navItems={navItems}
        workspaceItems={WORKSPACE_NAV_ITEMS}
        pinnedClasses={pinnedClasses}
        userName={user.name}
        userInitials={initials}
        userRole={claims.role}
      />
      <div className="flex flex-1 flex-col">
        <header className="border-b border-neutral-200/50 px-6 py-4">
          <h1 className="text-base font-bold tracking-tight text-neutral-900 lg:text-lg">
            Welcome, {user.name}
          </h1>
          <p className="text-[11px] font-medium capitalize text-neutral-400 lg:text-xs">
            {claims.role} workspace
          </p>
        </header>
        <main className="flex-1 bg-[#F8F9FA]/80 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the full suite to check for regressions**

Run: `cd apps/web && npx vitest run`
Expected: all pass, including `tests/nav-items.test.ts` (untouched — `Sidebar` consumes `getNavItemsForRole`'s output but doesn't change its behavior).

- [ ] **Step 7: Build check**

Run: `cd apps/web && npm run build`
Expected: succeeds with no type errors (confirms `Sidebar`'s prop types line up with `NavItem` from `nav-items.ts` and that `dashboard/layout.tsx` compiles).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/dashboard/Sidebar.tsx apps/web/src/app/dashboard/layout.tsx apps/web/tests/sidebar.test.tsx
git commit -m "Add collapsible sidebar with localStorage-persisted state"
```

---

## Task 8: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and log in as admin**

Use `preview_start`/`preview_click`/`preview_snapshot`/`preview_screenshot` tools against the running dev server. Log in as an admin user (seeded fixture credentials, per `apps/web/prisma/fixtures.ts`).

- [ ] **Step 2: Verify the Staff page**

Navigate to `/dashboard/staff`. Confirm:
- Cards render with initials avatars, name, role, and (for teachers with an assignment) the class/subject line.
- The role filter narrows the grid correctly.
- "Add new staff" opens a blank modal; creating a teacher with a class+subject succeeds and the new card appears.
- Clicking an existing card opens it pre-filled; editing the name and clicking Save persists and the card updates.
- Deleting a staff member with recorded activity (e.g. one who has marked attendance) shows the "Deactivate instead" flow in the popup; confirming it marks them Inactive (badge appears on the card).
- The currently logged-in admin's own card has no Delete button.

- [ ] **Step 3: Verify the Students page**

Navigate to `/dashboard/students`. Confirm:
- Default view shows all students across classes.
- Selecting a class in the filter narrows the grid to only that class.
- "Add new student" pre-fills the class field when a specific class is selected in the filter.
- Creating a student with an uploaded photo succeeds; the photo appears on the new card.
- Editing an existing student's roll number and class via the popup persists correctly.
- Deleting a student with recorded history (e.g. attendance) shows the "Deactivate instead" flow.
- Logging in as a teacher instead: confirm the Students page has no "Add new student" button and cards open in read-only mode (no Save/Delete).

- [ ] **Step 4: Verify the sidebar collapse**

On any dashboard page, click the sidebar's collapse toggle. Confirm it shrinks to an icon-only rail with nav icons still clickable. Reload the page and confirm it stays collapsed. Click expand and confirm it returns to full width with labels.

- [ ] **Step 5: Report results**

Summarize pass/fail for each check above. If anything fails, fix it in the relevant task's files and re-verify before considering this plan complete.
