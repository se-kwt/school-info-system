# Student Form Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `StudentDetailModal.tsx` per the approved "numbered card sections" mockup — a visible `<label>` above every field, filled/rounded inputs, numbered section badges, sub-card styling for repeatable Sibling/Parent rows, and a wider modal (672px instead of 512px) — without changing any behavior, state, or the API.

**Architecture:** Add a small reusable `Field` component (label + input wrapper) and extend the existing `FormSection` component with a numbered badge. Give `Modal` an opt-in `maxWidthClassName` prop so only this form gets wider, leaving Staff's modal untouched. Then restyle `StudentDetailModal.tsx` field-by-field using these building blocks.

**Tech Stack:** Next.js (App Router), Tailwind CSS, Vitest + Testing Library. No new dependencies.

## Global Constraints

- No behavior change: every `aria-label` string on every input/select stays exactly as it is today, so the existing `tests/student-detail-modal.test.tsx` suite (which queries by `getByLabelText("...")`) keeps passing unmodified.
- `Modal.tsx` is shared with `StaffDetailModal.tsx` — any change must default to today's `max-w-lg` behavior for callers that don't opt in.
- Match the approved mockup: indigo-50/indigo-600 numbered badges (consistent with existing indigo accents elsewhere in the app, e.g. `Sidebar.tsx`, `TodaysTimetablePanel.tsx`), `bg-neutral-50`/`border-neutral-200`/`rounded-lg` filled inputs, sub-cards for repeatable rows with a "Sibling N"/"Parent N" tag and a "Remove" text link.

---

### Task 1: `Modal` gets an opt-in width prop

**Files:**
- Modify: `apps/web/src/components/school-setup/Modal.tsx`
- Test: `apps/web/tests/modal.test.tsx`

**Interfaces:**
- Produces: `Modal({ children, onClose, maxWidthClassName }: { children: React.ReactNode; onClose: () => void; maxWidthClassName?: string })`. `maxWidthClassName` defaults to `"max-w-lg"` (today's behavior). Task 4 passes `maxWidthClassName="max-w-2xl"` from `StudentDetailModal`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/modal.test.tsx`, after the last `it(...)` block:

```typescript
  it("defaults to max-w-lg when no maxWidthClassName is given", () => {
    render(
      <Modal onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByTestId("modal-backdrop").firstElementChild).toHaveClass("max-w-lg");
  });

  it("uses a custom maxWidthClassName when given", () => {
    render(
      <Modal onClose={() => {}} maxWidthClassName="max-w-2xl">
        <p>Modal content</p>
      </Modal>
    );
    const panel = screen.getByTestId("modal-backdrop").firstElementChild;
    expect(panel).toHaveClass("max-w-2xl");
    expect(panel).not.toHaveClass("max-w-lg");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/modal.test.tsx`
Expected: FAIL — `Modal` doesn't accept a `maxWidthClassName` prop yet, and the panel div hardcodes `max-w-lg`.

- [ ] **Step 3: Implement**

Replace the full contents of `apps/web/src/components/school-setup/Modal.tsx`:

```typescript
"use client";

import { useEffect } from "react";

export function Modal({
  children,
  onClose,
  maxWidthClassName = "max-w-lg",
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
}) {
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
        className={`flex max-h-[85vh] w-full ${maxWidthClassName} flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/modal.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/Modal.tsx apps/web/tests/modal.test.tsx
git commit -m "Add opt-in maxWidthClassName prop to Modal"
```

---

### Task 2: `FormSection` gets a numbered badge

**Files:**
- Modify: `apps/web/src/components/school-setup/FormSection.tsx`
- Test: Create `apps/web/tests/form-section.test.tsx` additions (file already exists from the prior feature work — extend it)

**Interfaces:**
- Produces: `FormSection({ number, title, children }: { number: number; title: string; children: React.ReactNode })`. `number` is required — every call site must be updated (Task 4 does this for all three sections).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/form-section.test.tsx` (after the existing test):

```typescript
  it("renders a numbered badge", () => {
    render(
      <FormSection number={2} title="Sibling Details">
        <input aria-label="Example field" />
      </FormSection>
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sibling Details" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/form-section.test.tsx`
Expected: FAIL — `FormSection` doesn't accept/render a `number` prop, and the existing first test now fails to compile since `number` becomes a required prop without a default (TypeScript error on the existing call site missing `number`). Update the existing test too, in the same file, to pass `number={1}`:

```typescript
  it("renders a heading and its children", () => {
    render(
      <FormSection number={1} title="Student Details">
        <input aria-label="Example field" />
      </FormSection>
    );
    expect(screen.getByRole("heading", { name: "Student Details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Example field")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Implement**

Replace the full contents of `apps/web/src/components/school-setup/FormSection.tsx`:

```typescript
export function FormSection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-xs font-bold text-indigo-600">
          {number}
        </span>
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/form-section.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/FormSection.tsx apps/web/tests/form-section.test.tsx
git commit -m "Add numbered badge and two-column grid to FormSection"
```

---

### Task 3: New `Field` label-wrapper component

**Files:**
- Create: `apps/web/src/components/school-setup/Field.tsx`
- Test: Create `apps/web/tests/field.test.tsx`

**Interfaces:**
- Produces: `Field({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: React.ReactNode })` — renders a visible `<label>` (linked via `htmlFor`/matching input `id`) above `children`. `className` is an escape hatch for grid-span overrides (e.g. `"col-span-2"` for full-width fields); defaults to `""`. Task 4 wraps every input/select in a `Field`, passing a unique `id` matching each field's existing `aria-label` semantics.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/field.test.tsx`:

```typescript
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "../src/components/school-setup/Field";

describe("Field", () => {
  it("renders a visible label linked to its input via htmlFor/id", () => {
    render(
      <Field label="First name" htmlFor="firstName">
        <input id="firstName" aria-label="First name" />
      </Field>
    );
    const label = screen.getByText("First name");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "firstName");
    expect(screen.getByLabelText("First name")).toHaveAttribute("id", "firstName");
  });

  it("applies an optional className to the wrapper for grid-span overrides", () => {
    render(
      <Field label="Notes" htmlFor="notes" className="col-span-2">
        <input id="notes" aria-label="Notes" />
      </Field>
    );
    expect(screen.getByText("Notes").parentElement).toHaveClass("col-span-2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/field.test.tsx`
Expected: FAIL — module `../src/components/school-setup/Field` does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/school-setup/Field.tsx`:

```typescript
export function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-neutral-600">
        {label}
      </label>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/field.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/school-setup/Field.tsx apps/web/tests/field.test.tsx
git commit -m "Add Field label-wrapper component"
```

---

### Task 4: Restyle `StudentDetailModal` with `Field`, numbered `FormSection`, filled inputs, sub-cards, and a wider `Modal`

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentDetailModal.tsx`
- Modify: `apps/web/tests/student-detail-modal.test.tsx`

**Interfaces:**
- Consumes: `Modal({ maxWidthClassName })` from Task 1, `FormSection({ number, title })` from Task 2, `Field({ label, htmlFor, className })` from Task 3.
- Produces: no prop/behavior changes to `StudentDetailModal` itself — same `SaveStudentFields`, same `aria-label`s, same save/sibling/parent logic. Purely internal JSX/styling restructuring.

- [ ] **Step 1: Write the failing tests for visible labels**

Add to `apps/web/tests/student-detail-modal.test.tsx`, a new test after the existing "create mode: Division shows..." test:

```typescript
  it("create mode: every Student Details field has a visible label", () => {
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
        isAdmin={true}
        defaultClassId={2}
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
    for (const text of [
      "First name",
      "Last name",
      "Admission number",
      "Date of birth",
      "Roll number",
      "Class",
      "Division",
      "Date of join",
      "ID",
      "Gender",
    ]) {
      const label = screen.getByText(text, { selector: "label" });
      expect(label).toBeInTheDocument();
    }
  });

  it("sibling and parent rows also render visible labels", async () => {
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
        isAdmin={true}
        defaultClassId={2}
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
    await userEvent.click(screen.getByRole("button", { name: "Add sibling" }));
    expect(screen.getByText("Select student", { selector: "label" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add parent" }));
    expect(screen.getByText("Relationship", { selector: "label" })).toBeInTheDocument();
    // "First name" now appears twice (Student Details + Parent 1) — assert both are labels.
    const firstNameLabels = screen.getAllByText("First name", { selector: "label" });
    expect(firstNameLabels).toHaveLength(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/student-detail-modal.test.tsx`
Expected: FAIL — no `<label>` elements exist yet (only `aria-label` attributes), and `FormSection` calls in the component don't pass `number` (TypeScript error) until Step 3.

- [ ] **Step 3: Rewrite `StudentDetailModal.tsx`**

Update the imports at the top of `apps/web/src/components/school-setup/StudentDetailModal.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { StudentRow } from "./StudentCard";
import { FormSection } from "./FormSection";
import { Field } from "./Field";
```

Replace the `return (...)` block's `<Modal>` opening and the Student Details `FormSection` (everything from `return (` through the closing `</FormSection>` of Student Details) with:

```typescript
  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-2xl">
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new student" : student?.name}
      </h2>

      <div className="flex flex-col gap-4">
        <FormSection number={1} title="Student Details">
          <Field label="First name" htmlFor="firstName">
            <input
              id="firstName"
              type="text"
              aria-label="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="First name"
            />
          </Field>
          <Field label="Last name" htmlFor="lastName">
            <input
              id="lastName"
              type="text"
              aria-label="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="Last name"
            />
          </Field>
          <Field label="Admission number" htmlFor="admissionNo">
            <input
              id="admissionNo"
              type="text"
              aria-label="Admission number"
              value={admissionNo}
              onChange={(event) => setAdmissionNo(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="Admission number"
            />
          </Field>
          <Field label="Date of birth" htmlFor="dob">
            <input
              id="dob"
              type="date"
              aria-label="Date of birth"
              value={dob}
              onChange={(event) => setDob(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Roll number" htmlFor="rollNumber">
            <input
              id="rollNumber"
              type="text"
              aria-label="Roll number"
              value={rollNumber}
              onChange={(event) => setRollNumber(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="Roll number (optional)"
            />
          </Field>
          {showClassField && (
            <Field label="Class" htmlFor="classId">
              <select
                id="classId"
                aria-label="Class"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              >
                {mode === "edit" && <option value="">Keep current class</option>}
                {classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name} {klass.section}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Division" htmlFor="division">
            <input
              id="division"
              type="text"
              aria-label="Division"
              value={classes.find((klass) => String(klass.id) === classId)?.section ?? ""}
              disabled
              className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
              placeholder="Division"
            />
          </Field>
          <Field label="Date of join" htmlFor="dateOfJoin">
            <input
              id="dateOfJoin"
              type="date"
              aria-label="Date of join"
              value={dateOfJoin}
              onChange={(event) => setDateOfJoin(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="ID" htmlFor="studentIdNumber">
            <input
              id="studentIdNumber"
              type="text"
              aria-label="ID"
              value={studentIdNumber}
              onChange={(event) => setStudentIdNumber(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="Student ID number"
            />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <select
              id="gender"
              aria-label="Gender"
              value={gender}
              onChange={(event) => setGender(event.target.value as "male" | "female" | "")}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          {mode === "edit" && (
            <Field label="Status" htmlFor="status" className="col-span-2">
              <div
                id="status"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-800"
              >
                {student?.status}
              </div>
            </Field>
          )}
          {isAdmin && (
            <Field label="Photo" htmlFor="photo" className="col-span-2">
              <input
                id="photo"
                type="file"
                aria-label="Photo"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              />
            </Field>
          )}
        </FormSection>
```

Note: the "Status" field was previously a `<p>` outside any grid; it's now a `Field` with `col-span-2` so it spans the full width of the two-column grid rather than squeezing into one column.

Replace the Sibling Details `FormSection` with:

```typescript
        <FormSection number={2} title="Sibling Details">
          <div className="col-span-2 flex flex-col gap-3">
            {siblingIds.map((siblingId, index) => {
              const selected = allStudents.find((s) => s.id === siblingId);
              return (
                <div key={index} className="rounded-xl border border-neutral-100 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-neutral-400">
                      Sibling {index + 1}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => removeSiblingRow(index)}
                        className="text-xs font-semibold text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mb-3">
                    <Field label="Select student" htmlFor={`sibling-${index}-select`}>
                      <select
                        id={`sibling-${index}-select`}
                        aria-label={`Sibling ${index + 1}`}
                        value={siblingId ?? ""}
                        onChange={(event) => updateSiblingRow(index, event.target.value)}
                        disabled={!isAdmin}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      >
                        <option value="">Select a student</option>
                        {allStudents
                          .filter((s) => s.id !== student?.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.admissionNo})
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" htmlFor={`sibling-${index}-first`}>
                      <input
                        id={`sibling-${index}-first`}
                        type="text"
                        aria-label="Sibling first name"
                        value={selected?.name.split(" ")[0] ?? ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                    <Field label="Last name" htmlFor={`sibling-${index}-last`}>
                      <input
                        id={`sibling-${index}-last`}
                        type="text"
                        aria-label="Sibling last name"
                        value={selected ? selected.name.split(" ").slice(1).join(" ") : ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                    <Field label="Admission number" htmlFor={`sibling-${index}-admission`}>
                      <input
                        id={`sibling-${index}-admission`}
                        type="text"
                        aria-label="Sibling admission number"
                        value={selected?.admissionNo ?? ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                    <Field label="Gender" htmlFor={`sibling-${index}-gender`}>
                      <input
                        id={`sibling-${index}-gender`}
                        type="text"
                        aria-label="Sibling gender"
                        value={selected?.gender ?? ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                    <Field label="Class" htmlFor={`sibling-${index}-class`} className="col-span-2">
                      <input
                        id={`sibling-${index}-class`}
                        type="text"
                        aria-label="Sibling class"
                        value={selected?.class ? `${selected.class.name} ${selected.class.section}` : ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
            {isAdmin && (
              <button
                type="button"
                onClick={addSiblingRow}
                className="self-start text-xs font-semibold text-indigo-600"
              >
                + Add sibling
              </button>
            )}
          </div>
        </FormSection>
```

Replace the Parent Details `FormSection` with:

```typescript
        <FormSection number={3} title="Parent Details">
          <div className="col-span-2 flex flex-col gap-3">
            {parentRows.map((row, index) => (
              <div key={index} className="rounded-xl border border-neutral-100 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-neutral-400">
                    Parent {index + 1}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => removeParentRow(index)}
                      className="text-xs font-semibold text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Relationship" htmlFor={`parent-${index}-relationship`}>
                    <select
                      id={`parent-${index}-relationship`}
                      aria-label={`Parent ${index + 1} relationship`}
                      value={row.relationship}
                      onChange={(event) => updateParentRow(index, "relationship", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                    >
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Guardian">Guardian</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>
                  <div />
                  <Field label="First name" htmlFor={`parent-${index}-first`}>
                    <input
                      id={`parent-${index}-first`}
                      type="text"
                      aria-label={`Parent ${index + 1} first name`}
                      value={row.firstName}
                      onChange={(event) => updateParentRow(index, "firstName", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      placeholder="First name"
                    />
                  </Field>
                  <Field label="Last name" htmlFor={`parent-${index}-last`}>
                    <input
                      id={`parent-${index}-last`}
                      type="text"
                      aria-label={`Parent ${index + 1} last name`}
                      value={row.lastName}
                      onChange={(event) => updateParentRow(index, "lastName", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      placeholder="Last name"
                    />
                  </Field>
                  <Field label="Email" htmlFor={`parent-${index}-email`}>
                    <input
                      id={`parent-${index}-email`}
                      type="email"
                      aria-label={`Parent ${index + 1} email`}
                      value={row.email}
                      onChange={(event) => updateParentRow(index, "email", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      placeholder="Email"
                    />
                  </Field>
                  <Field label="Mobile number" htmlFor={`parent-${index}-phone`}>
                    <input
                      id={`parent-${index}-phone`}
                      type="tel"
                      aria-label={`Parent ${index + 1} mobile number`}
                      value={row.phone}
                      onChange={(event) => updateParentRow(index, "phone", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      placeholder="Mobile number"
                    />
                  </Field>
                </div>
              </div>
            ))}
            {isAdmin && (
              <button
                type="button"
                onClick={addParentRow}
                className="self-start text-xs font-semibold text-indigo-600"
              >
                + Add parent
              </button>
            )}
          </div>
        </FormSection>
      </div>
```

Leave everything from `{serverError && ...}` through the end of the file (the Save/Delete/Activate button row and the `deleteBlocked` panel) unchanged.

Note on IDs: each repeatable row's fields use a per-row-index `id` (e.g. `sibling-0-first`, `parent-1-email`) so multiple rows never collide. The single-instance Student Details fields use plain semantic ids (`firstName`, `dob`, etc.).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/student-detail-modal.test.tsx tests/modal.test.tsx tests/form-section.test.tsx tests/field.test.tsx`
Expected: PASS — every test in all four files.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd apps/web && npm test && npx tsc --noEmit`
Expected: all tests pass; no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/school-setup/StudentDetailModal.tsx apps/web/tests/student-detail-modal.test.tsx
git commit -m "Restyle StudentDetailModal with visible labels, numbered sections, and a wider modal"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and open the Students page as admin**

Use the `run` skill (or the project's dev server) and log in as admin, then navigate to School Setup → Students.

- [ ] **Step 2: Open "Add new student" and check the redesign**

Confirm: the modal is visibly wider than before, each of the three sections shows a numbered indigo badge, every field has a visible label above it, Student Details fields sit in a two-column grid, and Division/Status render as muted read-only boxes.

- [ ] **Step 3: Exercise Sibling and Parent rows**

Click "+ Add sibling" and "+ Add parent" — confirm each renders as a bordered sub-card with a "Sibling N"/"Parent N" tag and a "Remove" link, and that clicking a visible label focuses its input (tab through a few fields to confirm `htmlFor`/`id` linkage works).

- [ ] **Step 4: Check responsiveness and edit mode**

Open an existing student in edit mode and confirm the same styling applies, Status shows correctly, and nothing overflows the modal at typical viewport widths. Take a screenshot and report any visual issues found.
