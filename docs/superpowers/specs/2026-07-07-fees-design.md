# Fees — Design Spec

Status: Approved — 2026-07-07

## 1. Scope and Motivation

Attendance, Assignments, Timetable, and Marks are merged — Fees is next on the roadmap. This sub-project covers:

1. Admin creating `FeeStructure` entries (class, term, amount, due date) — create-only, admin-only.
2. Accountant and Admin recording a fee payment for one student at a time — the amount entered is *this transaction's increment*, added to a cumulative running total per `(student, feeStructure)`. Status (`unpaid`/`partial`/`paid`) is recomputed server-side from the new cumulative total. A payment that would push the total above the fee structure's amount is rejected.
3. Both roles viewing a class's fee roster for a selected fee structure: every student's cumulative amount paid, the total due, and status.

**Explicitly out of scope:**
- The parent-facing dues/reminders view — deferred to the mobile app sub-project, same reasoning as every other feature's deferred parent API.
- Editing or deleting a `FeeStructure` after creation (create-only, matching the Exam pattern).
- Overpayment/refund handling — a payment that would exceed the amount due is rejected outright, not modeled as a credit or negative balance.
- Teacher access of any kind — this feature is scoped to `["admin", "accountant"]` only, with no `ClassTeacher`-based logic anywhere.

## 2. Schema Changes

```prisma
model FeePayment {
  id             Int          @id @default(autoincrement())
  student        Student      @relation(fields: [studentId], references: [id])
  studentId      Int
  feeStructure   FeeStructure @relation(fields: [feeStructureId], references: [id])
  feeStructureId Int
  amountPaid     Float
  paidDate       DateTime?
  recordedBy     User         @relation("RecordedBy", fields: [recordedById], references: [id])
  recordedById   Int
  status         FeeStatus    @default(unpaid)

  @@unique([studentId, feeStructureId])
}
```

Only change: add `@@unique([studentId, feeStructureId])`. This makes "record a payment" a natural upsert — the first payment creates the row with `amountPaid` equal to the increment; each subsequent payment updates the same row by adding the new increment to the existing total. This is the project's second real migration (after Timetable's `TimetableEntry` migration).

## 3. Architecture

**`src/lib/fee-structures.ts`** — Admin-setup-style module, matching `src/lib/exams.ts`:
- `listFeeStructures(prisma, classId, schoolId)` — fee structures for a class, scoped by school.
- `createFeeStructure(prisma, schoolId, input)` — no unique-constraint conflict path (no natural uniqueness key on class+term), so create is validation-only, no `409` case.

**`src/lib/fee-payments.ts`**:
- `getFeeRoster(prisma, { feeStructureId, schoolId })` — every student in the fee structure's class, with `amountPaid` (`0` if no `FeePayment` row exists yet), `amount` (the fee structure's total, always present), and `status` (`"unpaid"` default for a student with no row). Scoped only by `schoolId` — **neither Admin nor Accountant is teacher-scoped**, so there is no `ClassTeacher` check anywhere in this feature, unlike Attendance/Assignments/Marks.
- `recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById, amount })` — verifies the fee structure belongs to the school, verifies the student belongs to the fee structure's class, computes the new cumulative total (`existingAmountPaid + amount`), rejects if it would exceed the fee structure's `amount`, computes `status` (`0` → `"unpaid"`, `< amount` → `"partial"`, `>= amount` → `"paid"`), and upserts the single `FeePayment` row keyed on the compound unique `studentId_feeStructureId`. No `$transaction` needed — this is always a single-row write, unlike every prior feature's bulk per-student writes.

Both `requireApiRole` and `requireDashboardRole` gate this entire feature to `["admin", "accountant"]` — no teacher access at all, matching the existing nav config (`src/lib/dashboard/nav-items.ts` already restricts `/dashboard/fees` to admin/accountant) and the Accountant persona's "fee-scoped, no access to academic records" description from the original design doc.

Single Server Component page `/dashboard/fees`: class selector (any class in school, for both roles — no per-role scoping since neither is a teacher), fee-structure selector for that class, and (Admin only) a "New Fee Structure" form.

## 4. Screen

**`/dashboard/fees`** (single page, both roles):

1. **Class selector** — dropdown, all classes in the school (`listClasses`, the same helper Admin already uses elsewhere; Accountant gets the same unrestricted list since they aren't teacher-scoped).
2. **Admin only: "New Fee Structure" form** — term, amount, due date. Submitting posts and adds the new fee structure to the selector's options.
3. **Fee-structure selector** — dropdown of fee structures for the selected class (e.g. "Term 1 — ₹5000, due 2026-09-01").
4. **Roster table** — one row per student in the class: name, amount paid so far, total amount due, status (colored: green = paid, amber = partial, red = unpaid). Both roles see this.
5. **Both roles: per-row "Record Payment"** — an inline amount input + "Record" button per student row. Submitting posts a single-student payment immediately (not a bulk save, unlike Attendance/Marks) and updates that row's amount paid/status on success using the response, without a full re-fetch.

## 5. API Contracts

### `GET /api/fee-structures`

Query params: `classId` (number).

Requires `requireApiRole(["admin", "accountant"])`.

- `400 { error: "classId is required" }` if missing/non-numeric.
- `400 { error: "The selected class does not exist" }` if `classId` doesn't belong to `claims.schoolId`.
- Success `200`: `{ feeStructures: Array<{ id: number; term: string; amount: number; dueDate: string }> }`, sorted by `dueDate` descending.

### `POST /api/fee-structures`

Requires `requireApiRole(["admin"])`. Accountant always `403`.

Body: `{ classId: number; term: string; amount: number; dueDate: string }`.

- `400 { error: "classId, term, amount, and dueDate are required" }` if any field is missing.
- `400 { error: "The selected class does not exist" }` if `classId` doesn't belong to `claims.schoolId`.
- Success `200 { id: number }`.

### `GET /api/fee-payments`

Query params: `feeStructureId` (number).

Requires `requireApiRole(["admin", "accountant"])`.

- `400 { error: "feeStructureId is required" }` if missing/non-numeric.
- `400 { error: "The selected fee structure does not exist" }` if `feeStructureId` doesn't belong to `claims.schoolId`.
- Success `200`:
  ```
  {
    students: Array<{
      studentId: number;
      name: string;
      amountPaid: number;
      amount: number;
      status: "paid" | "partial" | "unpaid";
    }>
  }
  ```
  `amountPaid` is `0` and `status` is `"unpaid"` for a student with no `FeePayment` row yet. `amount` is always the fee structure's total, independent of any row's existence.

### `POST /api/fee-payments`

Requires `requireApiRole(["admin", "accountant"])`.

Body: `{ feeStructureId: number; studentId: number; amount: number }` — `amount` is this transaction's increment, not the new total.

- `400 { error: "feeStructureId, studentId, and amount are required" }` if any field is missing.
- `400 { error: "The selected fee structure does not exist" }` if `feeStructureId` doesn't belong to `claims.schoolId`.
- `400 { error: "This student does not belong to the fee structure's class" }` if `studentId` doesn't belong to the fee structure's `classId`.
- `400 { error: "amount must be greater than 0" }` if `amount` is zero or negative.
- `400 { error: "This payment would exceed the amount due" }` if `existingAmountPaid + amount > feeStructure.amount`. No row is written when this happens.
- On success: upserts the `FeePayment` row (`studentId_feeStructureId` compound key), setting `amountPaid` to the new cumulative total, `status` recomputed (`0` → `"unpaid"`, `< amount` → `"partial"`, `>= amount` → `"paid"`), `recordedById: claims.userId`, `paidDate: now`. Returns `200 { amountPaid: number; status: "paid" | "partial" | "unpaid" }` — the new cumulative total and status, so the client can update the roster row without a full re-fetch.

## 6. Testing

Following the established Vitest + real-seeded-data + `vi.hoisted` cookie-mocking pattern:

- `GET` / `POST /api/fee-structures`: admin creates and lists, missing-field `400`, cross-school `classId` `400`, accountant `POST` → `403`.
- `GET /api/fee-payments`: a student with no `FeePayment` row returns `amountPaid: 0, status: "unpaid"`; a student with an existing row returns the correct `amountPaid`/`status`; cross-school `feeStructureId` → `400`; missing `feeStructureId` → `400`.
- `POST /api/fee-payments`: a fresh payment creates the row with correct cumulative total and status (verified via direct Prisma query); a second payment adds cumulatively and recomputes status correctly through the sequence unpaid → partial → paid; a payment that would exceed the amount due → `400`, with no row created/mutated (verified via direct Prisma query, including the "first payment ever, amount already exceeds total" case where no prior row exists); a `studentId` outside the fee structure's class → `400`; a non-positive `amount` → `400`; both Admin and Accountant can successfully record a payment (two separate tests, one per role).
