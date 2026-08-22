# Phase 7b: Records and Profiles (Forms) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the fields Phase 7a added, and fix the three cases where the backend already supports something no form can reach — the syllabus file input, the staff email field, and the student date-of-birth that cannot be seen when editing.

**Architecture:** Six sequential tasks, one per form surface. No schema changes and no new service functions — every field this phase exposes already exists and is already threaded through create and edit. Each task lands as its own commit.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 + Testing Library, TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 7b).

## Hard dependency: Phase 7a must have landed

Every field below exists only after 7a. Verify:

```bash
grep -c "qualification\|bloodGroup\|sortOrder\|isCurrent" apps/web/prisma/schema.prisma
```

Expect at least 4. If it returns 0, run Phase 7a first.

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` clean after every task; previously-passing tests stay green. Record the baseline before Task 1.
- **No migration in this phase.** `prisma/schema.prisma` is not modified. If a task appears to need a column, 7a missed it — add it there.
- **No new service functions.** If a field cannot be sent, 7a did not thread it through; fix it there.
- Tests are Testing Library component tests following the patterns in `tests/students-view.test.tsx` and `tests/classes-view.test.tsx`.
- Failing test first, always.
- Follow the existing form composition: `Field.tsx` for inputs and `FormSection.tsx` for grouping. Do not introduce a form library.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `src/components/school-setup/StudentsView.tsx`, `StudentCard.tsx`, `StudentDetailModal.tsx` | Admission fields; the `dob` load fix |
| `src/components/school-setup/StaffView.tsx`, `StaffDetailModal.tsx` | HR fields; email |
| `src/components/school-setup/SyllabusHistoryView.tsx` | File input; current-version badge |
| `src/components/school-setup/GradeDetailView.tsx`, `ClassesView.tsx` | Subject and class fields |
| `src/components/settings/SchoolProfileSettings.tsx` | Editable name and school profile |
| `src/app/api/school/route.ts` | **New** — `PATCH` for the school profile |

---

- [ ] **Task 0: Establish the baseline**

Run: `npm test 2>&1 | tail -20` and record the passing count. Confirm the 7a dependency above.

---

### Task 1: Fix the student date-of-birth on load

The DOB input is seeded to an empty string even when editing an existing student, because the row type feeding the modal has no `dob` field. Omitting it is harmless — it is dropped from the PATCH — but an admin cannot see or verify an existing date of birth, and cannot correct a wrong one.

This is first because it is the smallest change and it proves the row-type-to-form plumbing before five larger tasks lean on it.

**Files:**
- Modify: the student row type and the query that builds it (`grep -rn "StudentRow\|interface Student" src/components/school-setup src/lib/school-setup/students.ts`)
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx` (or wherever the edit modal seeds its state)
- Test: `apps/web/tests/students-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
it("pre-fills the date of birth when editing an existing student", async () => {
  render(
    <StudentsView
      initialStudents={[
        {
          id: 1,
          name: "Existing Student",
          dob: "2015-03-14",
          admissionNo: "EX-001",
          classId: 1,
          className: "Grade 1 · A",
          status: "active",
        },
      ]}
      classes={[{ id: 1, gradeId: 1, gradeName: "Grade 1", section: "A" }]}
    />
  );

  await userEvent.click(screen.getByRole("button", { name: /edit existing student/i }));

  expect(screen.getByLabelText(/date of birth/i)).toHaveValue("2015-03-14");
});
```

Read the component's real prop names and the edit trigger's accessible name first, and align the test to them.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/students-view.test.tsx -t "pre-fills the date of birth"`

Expected: FAIL — the input has value `""`.

- [ ] **Step 3: Add `dob` to the row type**

Find the interface describing a student row in the view and add `dob: string`. Then find the server-side query that produces those rows — in `src/lib/school-setup/students.ts`'s list function — and project `dob`, formatted as `student.dob.toISOString().slice(0, 10)` so it drops straight into a `type="date"` input.

- [ ] **Step 4: Seed the edit state from it**

Where the edit modal initialises its fields, replace the empty-string default for DOB with the row's value.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/students-view.test.tsx tests/students-api.test.ts`

- [ ] **Step 6: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components src/lib/school-setup/students.ts tests
git commit -m "fix(students): pre-fill date of birth when editing"
```

---

### Task 2: Expose the student admission fields

Nine fields from Phase 7a Task 5: address, blood group, nationality, religion, previous school, emergency contact name and phone, category, admission date. Plus `gender: "other"` from 7a Task 8 and the `GuardianRelationship` enum on parent rows.

**Files:**
- Modify: `apps/web/src/components/school-setup/StudentsView.tsx`, `StudentDetailModal.tsx`
- Test: `apps/web/tests/students-view.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
it("sends every admission field on create", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
  vi.stubGlobal("fetch", fetchMock);

  render(/* StudentsView with an empty list and one class */);

  await userEvent.click(screen.getByRole("button", { name: /add student/i }));
  await userEvent.type(screen.getByLabelText(/^name/i), "New Student");
  await userEvent.type(screen.getByLabelText(/date of birth/i), "2015-01-01");
  await userEvent.type(screen.getByLabelText(/admission number/i), "NEW-001");
  await userEvent.type(screen.getByLabelText(/^address/i), "12 Example Road");
  await userEvent.type(screen.getByLabelText(/blood group/i), "O+");
  await userEvent.type(screen.getByLabelText(/emergency contact name/i), "Aunt");
  await userEvent.type(screen.getByLabelText(/emergency contact phone/i), "+919876543210");
  await userEvent.type(screen.getByLabelText(/previous school/i), "Little Flower LP");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
  expect(body.address).toBe("12 Example Road");
  expect(body.bloodGroup).toBe("O+");
  expect(body.emergencyContactName).toBe("Aunt");
  expect(body.emergencyContactPhone).toBe("+919876543210");
  expect(body.previousSchool).toBe("Little Flower LP");
});

it("offers a third gender option", async () => {
  render(/* same */);
  await userEvent.click(screen.getByRole("button", { name: /add student/i }));

  const select = screen.getByLabelText(/gender/i);
  const options = within(select).getAllByRole("option").map((o) => o.getAttribute("value"));

  expect(options).toEqual(expect.arrayContaining(["male", "female", "other"]));
});

it("offers guardian relationship as a fixed list, not free text", async () => {
  render(/* same */);
  await userEvent.click(screen.getByRole("button", { name: /add student/i }));

  const select = screen.getByLabelText(/relationship/i);
  expect(select.tagName).toBe("SELECT");
  const options = within(select).getAllByRole("option").map((o) => o.getAttribute("value"));
  expect(options).toEqual(
    expect.arrayContaining(["father", "mother", "guardian", "grandparent", "sibling", "other"])
  );
});
```

The third test is the one that gives 7a's enum its value. Leaving the relationship as a free-text input would keep the typo problem the enum was added to solve.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/students-view.test.tsx -t "admission field"`

- [ ] **Step 3: Add a form section for the admission record**

The form already uses `FormSection.tsx` for grouping. Add one section — "Admission record" — holding the nine new fields, so the primary section stays short. Nine extra inputs inlined into the existing block makes the common case of creating a student with name, DOB and class considerably worse.

Every new field is optional. Do not add `required` to any of them; the service accepts them all as optional and a school that does not collect blood groups must not be blocked.

Use the existing `Field.tsx` for each. `admissionDate` is `type="date"`; the rest are `type="text"` except `emergencyContactPhone`, which is `type="tel"`.

- [ ] **Step 4: Convert gender and relationship to selects**

Gender gains an `other` option. Relationship becomes a `<select>` with the six `GuardianRelationship` values, defaulting to `guardian`.

Give each a real `<label>` or `aria-label` — the tests query by label, and so do screen readers.

- [ ] **Step 5: Send them**

Add each field to the create and edit request bodies. Send `undefined` rather than `""` for an empty optional field so the service stores `null`.

- [ ] **Step 6: Show them in the detail modal**

`StudentDetailModal.tsx` displays a student's record. Add the new fields, omitting any that are null rather than rendering an empty row.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/students-view.test.tsx tests/student-detail-modal.test.tsx tests/students-api.test.ts`

- [ ] **Step 8: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 9: Commit**

```bash
git add src/components tests
git commit -m "feat(students): expose admission record fields in the form"
```

---

### Task 3: Expose the staff HR fields and email

Six fields from Phase 7a Task 6 — qualification, designation, joining date, salary, address, photo — plus `User.email`, which has existed in the schema all along with no input anywhere.

**Files:**
- Modify: `apps/web/src/components/school-setup/StaffView.tsx`, `StaffDetailModal.tsx`, `StaffCard.tsx`
- Test: `apps/web/tests/staff-view.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
it("sends email and HR fields on create", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
  vi.stubGlobal("fetch", fetchMock);

  render(/* StaffView with an empty list */);

  await userEvent.click(screen.getByRole("button", { name: /add staff/i }));
  await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
  await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
  await userEvent.type(screen.getByLabelText(/email/i), "teacher@example.com");
  await userEvent.type(screen.getByLabelText(/qualification/i), "M.Sc., B.Ed.");
  await userEvent.type(screen.getByLabelText(/designation/i), "Senior Teacher");
  await userEvent.type(screen.getByLabelText(/joining date/i), "2020-06-01");
  await userEvent.type(screen.getByLabelText(/salary/i), "45000");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
  expect(body.email).toBe("teacher@example.com");
  expect(body.qualification).toBe("M.Sc., B.Ed.");
  expect(body.designation).toBe("Senior Teacher");
  expect(body.joiningDate).toBe("2020-06-01");
  expect(body.salary).toBe(45000);
});

it("rejects a malformed email before submitting", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(/* same */);
  await userEvent.click(screen.getByRole("button", { name: /add staff/i }));
  await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
  await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
  await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects a negative salary before submitting", async () => {
  // ...same shape, salary "-100"
  expect(fetchMock).not.toHaveBeenCalled();
});
```

`salary` is sent as a **number**, not a string — the service and the `Decimal` column both expect one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/staff-view.test.tsx -t "HR fields"`

- [ ] **Step 3: Add the fields**

Group the six HR fields plus email into an "Employment details" `FormSection`, leaving name, phone and role in the primary block. All optional.

`salary` is `type="number"` with `min="0"` and `step="1"`. `joiningDate` is `type="date"`. `photoUrl` reuses whatever upload control the student photo already uses — read `StudentsView.tsx` for the existing pattern rather than building a second one.

- [ ] **Step 4: Validate email and salary client-side**

```typescript
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address");
      return;
    }
    if (salary !== "" && Number(salary) < 0) {
      setError("Salary cannot be negative");
      return;
    }
```

A deliberately simple email pattern. Full RFC validation is not worth it and rejects valid addresses; this catches the typo that matters.

- [ ] **Step 5: Show them in the detail modal and card**

Add the fields to `StaffDetailModal.tsx`, omitting nulls. If Phase 5 has landed, render salary through `formatMoney` from `src/lib/money.ts` rather than interpolating the raw number.

Show `designation` on `StaffCard.tsx` under the name — it is the single most useful of the six at a glance.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/staff-view.test.tsx tests/staff-api.test.ts`

- [ ] **Step 7: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/components tests
git commit -m "feat(staff): expose email and HR fields in the form"
```

---

### Task 4: The syllabus file input and current-version badge

The most conspicuous of the three "supported but unreachable" gaps. The API accepts a file, the schema stores `fileUrl` and `fileName`, and the list view **renders a download link when one is present** — but there is no file input, so no admin can ever produce that state. The rendering code has never once executed in production.

Phase 7a added `isCurrent`; the list still shows versions newest-first with no badge marking which one is current.

**Files:**
- Modify: `apps/web/src/components/school-setup/SyllabusHistoryView.tsx`
- Test: `apps/web/tests/syllabus-history-view.test.tsx` (confirm with `ls tests | grep -i syllab`)

- [ ] **Step 1: Write the failing tests**

```typescript
it("uploads a file with a new syllabus version", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ url: "https://example.test/f.pdf", name: "syllabus.pdf" }),
  });
  vi.stubGlobal("fetch", fetchMock);

  render(/* SyllabusHistoryView with no versions */);

  await userEvent.type(screen.getByLabelText(/title/i), "Version 1");
  await userEvent.type(screen.getByLabelText(/content/i), "Chapters 1-5");
  const file = new File(["pdf bytes"], "syllabus.pdf", { type: "application/pdf" });
  await userEvent.upload(screen.getByLabelText(/attach file/i), file);
  await userEvent.click(screen.getByRole("button", { name: /publish version/i }));

  const uploadCall = fetchMock.mock.calls.find(([url]) => String(url).includes("upload"));
  expect(uploadCall).toBeDefined();
});

it("marks the current version with a badge", () => {
  render(
    <SyllabusHistoryView
      subjectId={1}
      initialVersions={[
        { id: 2, versionNum: 2, title: "V2", content: "...", isCurrent: true, createdAt: "2026-08-01", fileUrl: null, fileName: null },
        { id: 1, versionNum: 1, title: "V1", content: "...", isCurrent: false, createdAt: "2026-07-01", fileUrl: null, fileName: null },
      ]}
    />
  );

  const currentRow = screen.getByText("V2").closest("li")!;
  expect(within(currentRow).getByText(/current/i)).toBeInTheDocument();

  const oldRow = screen.getByText("V1").closest("li")!;
  expect(within(oldRow).queryByText(/current/i)).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/syllabus-history-view.test.tsx`

- [ ] **Step 3: Add the file input**

The upload pattern already exists and works for assignment attachments and student photos. Find it:

```bash
grep -rn "type=\"file\"" src/components
```

Copy that flow exactly — upload the file to the existing upload endpoint first, then include the returned `fileUrl` and `fileName` in the create-version request. Do not invent a second upload mechanism, and do not post the file as part of the version body.

Label the input "Attach file" and accept the same MIME types the assignment attachment does.

- [ ] **Step 4: Add the current badge**

Add `isCurrent: boolean` to the version row type and to the query projecting it. Render a small badge beside the title when true, following whatever badge styling `EntityCard.tsx` already uses.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/syllabus-history-view.test.tsx tests/syllabus-api.test.ts`

- [ ] **Step 6: Verify the download link renders**

Run the dev server, publish a version with a file, and confirm the download link appears in the list. This is the first time that code path has ever run — a broken href or a missing `fileName` will only show up here, not in a test.

- [ ] **Step 7: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/components tests
git commit -m "feat(syllabus): add file upload input and current-version badge"
```

---

### Task 5: Subject and class fields

Five subject fields from Phase 7a Task 7 — code, credit hours, weekly periods, practical, elective — and two class fields: capacity and room.

**Files:**
- Modify: `apps/web/src/components/school-setup/GradeDetailView.tsx` (subjects), `ClassesView.tsx` (classes)
- Test: `apps/web/tests/grade-detail-view.test.tsx`, `tests/classes-view.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
it("sends the subject metadata on create", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
  vi.stubGlobal("fetch", fetchMock);

  render(/* GradeDetailView with no subjects */);

  await userEvent.click(screen.getByRole("button", { name: /add subject/i }));
  await userEvent.type(screen.getByLabelText(/subject name/i), "Physics");
  await userEvent.type(screen.getByLabelText(/subject code/i), "PHY-101");
  await userEvent.type(screen.getByLabelText(/weekly periods/i), "5");
  await userEvent.click(screen.getByLabelText(/elective/i));
  await userEvent.click(screen.getByRole("button", { name: /save/i }));

  const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
  expect(body.code).toBe("PHY-101");
  expect(body.weeklyPeriods).toBe(5);
  expect(body.isElective).toBe(true);
});

it("shows an elective badge on elective subjects", () => {
  render(/* GradeDetailView with one elective and one core subject */);
  const electiveRow = screen.getByText("Music").closest("li")!;
  expect(within(electiveRow).getByText(/elective/i)).toBeInTheDocument();
});

it("sends capacity and room on class create", async () => {
  // ...ClassesView, fill capacity 40 and room "B-204"
  const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
  expect(body.capacity).toBe(40);
  expect(body.room).toBe("B-204");
});

it("shows how full a class is when capacity is set", () => {
  render(
    <ClassesView
      initialClasses={[
        { id: 1, gradeId: 1, gradeName: "Grade 1", section: "A", capacity: 40, enrolledCount: 38, room: "B-204", archived: false },
      ]}
      /* ...other required props */
    />
  );

  expect(screen.getByText("38 / 40")).toBeInTheDocument();
});
```

The last test is worth the extra work in the query. Phase 7a made over-enrolment an error; showing the admin they are at 38 of 40 before they hit it is what makes that error avoidable rather than annoying.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/grade-detail-view.test.tsx tests/classes-view.test.tsx -t "metadata"`

- [ ] **Step 3: Add the subject fields**

Code, credit hours and weekly periods as inputs; practical and elective as checkboxes. Send numeric fields as numbers, not strings.

Render an "Elective" badge in the subject list, following the existing badge style.

- [ ] **Step 4: Add the class fields**

Capacity (`type="number"`, `min="1"`) and room (`type="text"`), both optional.

Project `enrolledCount` into the class row type. The list query must count active enrolments for the active year per class — add it as a Prisma `_count` on the relation with a filter rather than a query per class:

```typescript
    include: {
      _count: {
        select: {
          enrollments: { where: { academicYearId, status: "active" } },
        },
      },
    },
```

Render `{enrolledCount} / {capacity}` when capacity is set, and just `{enrolledCount}` when it is null.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/grade-detail-view.test.tsx tests/classes-view.test.tsx tests/classes-api.test.ts`

- [ ] **Step 6: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components src/lib/school-setup tests
git commit -m "feat(academics): expose subject metadata and class capacity"
```

---

### Task 6: The school profile

`School.name` is displayed but not editable, and no `PATCH` route exists — logo upload is the only working control on the settings page. Phase 7a added address, phone, email and principal name, all of which report cards and receipts will need.

**Files:**
- Create: `apps/web/src/app/api/school/route.ts`
- Modify: `apps/web/src/lib/school-setup/` — add `updateSchoolProfile` (this is the one service function this phase adds, because 7a had no natural home for it)
- Modify: `apps/web/src/components/settings/SchoolProfileSettings.tsx`
- Test: `apps/web/tests/school-profile-api.test.ts` (create), `tests/school-profile-settings.test.tsx`

**Interfaces:**
- Produces: `updateSchoolProfile(prisma, { schoolId, fields: { name?, address?, phone?, email?, principalName? } }): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "INVALID_NAME" }>`.
- Produces: `PATCH /api/school`, admin-only.

The Global Constraints say "no new service functions" — this is the single stated exception, because the school profile has no existing service module and inlining the update into the route would be the only such case in the codebase.

- [ ] **Step 1: Write the failing tests**

```typescript
it("updates the school profile", async () => {
  const result = await updateSchoolProfile(prisma, {
    schoolId,
    fields: {
      name: "Renamed School",
      address: "1 School Road",
      phone: "+914842223333",
      email: "office@school.test",
      principalName: "Dr. Example",
    },
  });

  expect(result).toEqual({ ok: true });

  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  expect(school.name).toBe("Renamed School");
  expect(school.principalName).toBe("Dr. Example");
});

it("rejects an empty name", async () => {
  const result = await updateSchoolProfile(prisma, { schoolId, fields: { name: "   " } });

  expect(result).toEqual({ ok: false, error: "INVALID_NAME" });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  expect(school.name).not.toBe("   ");
});

it("PATCH /api/school rejects a non-admin", async () => {
  // ...authenticated as a teacher
  expect(response.status).toBe(403);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/school-profile-api.test.ts`

- [ ] **Step 3: Add the service function**

```typescript
export type UpdateSchoolProfileResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_NAME" };

export async function updateSchoolProfile(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    fields: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
      principalName?: string;
    };
  }
): Promise<UpdateSchoolProfileResult> {
  const school = await prisma.school.findUnique({ where: { id: params.schoolId } });
  if (!school) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.name !== undefined && params.fields.name.trim() === "") {
    return { ok: false, error: "INVALID_NAME" };
  }

  const data: Record<string, string | null> = {};
  if (params.fields.name !== undefined) data.name = params.fields.name.trim();
  if (params.fields.address !== undefined) data.address = params.fields.address || null;
  if (params.fields.phone !== undefined) data.phone = params.fields.phone || null;
  if (params.fields.email !== undefined) data.email = params.fields.email || null;
  if (params.fields.principalName !== undefined) {
    data.principalName = params.fields.principalName || null;
  }

  await prisma.school.update({ where: { id: params.schoolId }, data });
  return { ok: true };
}
```

Name is trimmed and cannot be blanked; the other four can be cleared by sending an empty string, which becomes `null`.

- [ ] **Step 4: Add the route**

`PATCH /api/school`, admin-only, following the shape of the academic-years `[id]` route. No id in the path — an admin can only ever edit their own school, taken from `claims.schoolId`. Accepting an id here would be a tenant hole.

- [ ] **Step 5: Make the settings form editable**

Add inputs for the five fields to `SchoolProfileSettings.tsx`, seeded from the current values, with a Save button calling the new route. Leave the existing logo upload as it is.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/school-profile-api.test.ts tests/school-profile-settings.test.tsx`

- [ ] **Step 7: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/lib src/app/api/school src/components/settings tests
git commit -m "feat(settings): make the school profile editable"
```

---

## Phase 7b Exit Criteria

- [ ] Editing a student shows their existing date of birth, and correcting it persists.
- [ ] A student can be created with every admission field through the UI, and with none of them.
- [ ] Gender offers three options; guardian relationship is a select, not a text input.
- [ ] A staff member can be created with email and every HR field; a malformed email and a negative salary are both blocked client-side.
- [ ] A syllabus version can be published **with a file**, and the download link that has never rendered in production now does — verified in a browser, not only in a test.
- [ ] The current syllabus version carries a badge; older ones do not.
- [ ] Subjects show an Elective badge; classes show `enrolled / capacity` when capacity is set.
- [ ] The school name is editable, and address, phone, email and principal are stored.
- [ ] `git diff main --stat -- apps/web/prisma/` shows no change from this phase.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm test` all clean.

## What Phase 7b deliberately leaves open

- **No report card or receipt uses the school profile yet.** The letterhead data now exists; nothing prints it.
- **`Subject.isElective` is shown but not honoured.** The badge is informational — every enrolled student still implicitly takes every subject in their grade. Making electives real needs a student-subject join table.
- **No student-facing submission upload.** `Assignment.submissionUrl` exists from 7a but students have no login in this system, so only a teacher could populate it. Left alone.
