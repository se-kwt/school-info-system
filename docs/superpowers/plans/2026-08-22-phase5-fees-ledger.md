# Phase 5: Fees as a Ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `FeePayment` from a single mutable row per student per fee into an append-only ledger with a receipt number, a payment mode and a transaction reference; store money as `Decimal` instead of `Float`; add `overdue`, discounts and fines — finding C4 plus the fee rows of the audit's missing-fields and enum tables.

**Architecture:** Six sequential tasks. Task 1 is the ledger reshape and is the largest single change in the whole remediation. Task 2 converts money to `Decimal`. Tasks 3–5 add `overdue`, discounts/fines and the index. Task 6 applies a shared money formatter. Each task lands as its own commit.

**Tech Stack:** Next.js 16.3, React 19.2, Prisma 5.20, PostgreSQL, Vitest 4.1 (real-Postgres integration tests, `fileParallelism: false`), TypeScript 5.6.

**Spec:** `docs/superpowers/specs/2026-08-22-audit-remediation-design.md` (Phase 5).

## Global Constraints

- All commands run from `apps/web/`.
- `npx tsc --noEmit` and `npm run build` clean after every task; previously-passing tests stay green. Record the baseline before Task 1.
- Discriminated-union `Result` types; new error codes are **additive**.
- Tests import `{ prisma, resetDb }` from `./helpers/db`, `await resetDb()` in `beforeEach`.
- Failing test first, always.
- **No live data** — migrations may drop constraints and change column types, and may assume `prisma migrate reset`.
- **If Phase 2 has landed:** read every generated migration and delete any `DROP INDEX "AcademicYear_schoolId_active_key"` line. Applies to Tasks 1, 2, 3, 4 and 5.

## The one thing that must not change — read before Task 1

The audit is emphatic that `recordPayment` is the best-engineered flow in the codebase, and it is right. It runs the whole read-check-write sequence inside a single `prisma.$transaction` at `Serializable` isolation, guards against overpayment with `EXCEEDS_AMOUNT_DUE`, and the route retries on Prisma's `P2034` serialization failure.

**That concurrency handling is not in scope to change.** Every task below preserves:

- the `{ isolationLevel: "Serializable" }` option on the transaction,
- the full read-check-write inside one transaction body,
- the `EXCEEDS_AMOUNT_DUE` guard computed from the ledger, not from a cached column,
- the route's `P2034` retry.

There is one existing comment in the file worth reading before you touch it (`fee-payments.ts:74-76`): early `return { ok: false }` branches inside a Prisma interactive transaction still **commit**, because Prisma only rolls back on a thrown error. That is safe today only because nothing has written at those points. Task 1 adds a write, so re-check every early return that follows it.

**If the existing fee concurrency test breaks at any point in this phase, the change is wrong.** Do not adjust the test to accommodate the implementation.

## What "append-only ledger" means concretely

Today: `@@unique([studentId, feeStructureId])`, one row upserted repeatedly, `amountPaid` accumulating, `paidDate` and `recordedById` overwritten. After the second instalment the first one's date and the identity of whoever took the cash are gone.

After Task 1: one row per instalment. `amountPaid` on a row means "the amount of *this* payment", not the running total. The running total and the status are **derived by aggregation** and are no longer stored on `FeePayment` at all.

That last point is the part most likely to be got wrong. `FeePayment.status` is deleted. A per-instalment row has no meaningful status — the status belongs to the student's position against a fee structure, which is a computed thing.

## File Structure

| File | Responsibility in this phase |
|---|---|
| `prisma/schema.prisma` | `FeePayment` reshape; `Decimal` money; `FeeStatus.overdue`; `FeeStructure.discount`/`fineAmount` |
| `src/lib/fee-payments.ts` | Ledger append; aggregate-derived totals and status; receipt number generation |
| `src/lib/money.ts` | **New** — `formatMoney`, and `Decimal` ↔ number boundary helpers |
| `src/components/fees/*` | Mode / reference inputs; per-instalment history; formatted amounts |

---

- [ ] **Task 0: Establish the baseline**

Run: `npm test 2>&1 | tail -20` and record the passing count.

Also run the fee concurrency test alone and note it passes: `npx vitest run tests/fee-payments-api.test.ts`. This is the test that must never go red in this phase.

---

### Task 1: Make `FeePayment` an append-only ledger (C4)

**Files:**
- Modify: `apps/web/prisma/schema.prisma:399-414`
- Create: migration (generated)
- Modify: `apps/web/src/lib/fee-payments.ts`
- Test: `apps/web/tests/fee-payments-api.test.ts`

**Interfaces:**
- Produces: `FeePayment` = `{ id, studentId, feeStructureId, amountPaid, paidDate, mode, receiptNo, reference, recordedById, createdAt }` — no `status`, no unique constraint on `(studentId, feeStructureId)`.
- Produces: `PaymentMode` enum: `cash | cheque | card | bank_transfer | upi | other`.
- Produces: `recordPayment` params gain `mode: PaymentMode` and optional `reference?: string`.
- Produces: `listPaymentsForStudent(prisma, { studentId, feeStructureId, schoolId })` returning the instalment history.

- [ ] **Step 1: Write the failing tests**

```typescript
it("keeps every instalment as its own row", async () => {
  const first = await recordPayment(prisma, {
    feeStructureId,
    studentId,
    schoolId,
    recordedById: accountantId,
    amount: 2000,
    mode: "cash",
  });
  expect(first.ok).toBe(true);

  const second = await recordPayment(prisma, {
    feeStructureId,
    studentId,
    schoolId,
    recordedById: secondAccountantId,
    amount: 3000,
    mode: "upi",
    reference: "UPI-9981",
  });
  expect(second.ok).toBe(true);

  const rows = await prisma.feePayment.findMany({
    where: { studentId, feeStructureId },
    orderBy: { createdAt: "asc" },
  });

  expect(rows).toHaveLength(2);
  expect(Number(rows[0].amountPaid)).toBe(2000);
  expect(rows[0].mode).toBe("cash");
  expect(rows[0].recordedById).toBe(accountantId);
  expect(Number(rows[1].amountPaid)).toBe(3000);
  expect(rows[1].mode).toBe("upi");
  expect(rows[1].reference).toBe("UPI-9981");
  expect(rows[1].recordedById).toBe(secondAccountantId);
});

it("reports the running total and derived status from the ledger", async () => {
  // feeStructure.amount is 5000 in this fixture
  const first = await recordPayment(prisma, {
    feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 2000, mode: "cash",
  });
  expect(first).toMatchObject({ ok: true, amountPaid: 2000, status: "partial" });

  const second = await recordPayment(prisma, {
    feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 3000, mode: "cash",
  });
  expect(second).toMatchObject({ ok: true, amountPaid: 5000, status: "paid" });
});

it("still refuses a payment that would exceed the amount due", async () => {
  await recordPayment(prisma, {
    feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 4000, mode: "cash",
  });

  const result = await recordPayment(prisma, {
    feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 2000, mode: "cash",
  });

  expect(result).toEqual({ ok: false, error: "EXCEEDS_AMOUNT_DUE" });
  expect(await prisma.feePayment.count({ where: { studentId, feeStructureId } })).toBe(1);
});

it("issues a unique receipt number per payment", async () => {
  await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 1000, mode: "cash" });
  await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 1000, mode: "cash" });

  const rows = await prisma.feePayment.findMany({ where: { studentId, feeStructureId } });
  const receipts = rows.map((r) => r.receiptNo);

  expect(new Set(receipts).size).toBe(2);
  expect(receipts.every((r) => typeof r === "string" && r.length > 0)).toBe(true);
});

it("returns the full instalment history for a student", async () => {
  await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 2000, mode: "cash" });
  await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 3000, mode: "cheque", reference: "CHQ-4412" });

  const result = await listPaymentsForStudent(prisma, { studentId, feeStructureId, schoolId });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.payments).toHaveLength(2);
  expect(result.payments[1].reference).toBe("CHQ-4412");
});
```

The third test is the critical regression guard: it proves the overpayment check now reads the ledger rather than a stored running total, and that a rejected payment appends nothing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fee-payments-api.test.ts -t "own row"`

Expected: FAIL — the second `recordPayment` upserts the first row, so only one exists.

- [ ] **Step 3: Reshape the schema**

```prisma
enum PaymentMode {
  cash
  cheque
  card
  bank_transfer
  upi
  other
}

model FeePayment {
  id             Int          @id @default(autoincrement())
  student        Student      @relation(fields: [studentId], references: [id])
  studentId      Int
  feeStructure   FeeStructure @relation(fields: [feeStructureId], references: [id])
  feeStructureId Int
  amountPaid     Float
  paidDate       DateTime
  mode           PaymentMode
  receiptNo      String
  reference      String?
  recordedBy     User         @relation("RecordedBy", fields: [recordedById], references: [id])
  recordedById   Int
  createdAt      DateTime     @default(now())

  @@unique([feeStructureId, receiptNo])
  @@index([studentId, feeStructureId])
  @@index([feeStructureId])
  @@index([recordedById])
  @@index([paidDate])
}
```

Four things changed and each matters:

- `@@unique([studentId, feeStructureId])` is **gone**. That constraint is the defect.
- `status` is **gone**. Status is derived, not stored.
- `paidDate` is now non-nullable. A payment without a date is not a payment.
- `@@unique([feeStructureId, receiptNo])` scopes receipt numbers per fee structure and gives the database the final say on uniqueness even under concurrency.
- `@@index([paidDate])` is the audit's index gap — ordered and counted on, previously unindexed.

`amountPaid` stays `Float` in this task. Task 2 converts it; doing both at once makes a failure impossible to attribute.

Run `npx prisma migrate dev --create-only --name feepayment_ledger`, read the SQL, delete any stray `DROP INDEX "AcademicYear_schoolId_active_key"` line, and add a comment:

```sql
-- Destructive by design: drops the one-row-per-student-per-fee unique constraint
-- and the derived `status` column. No backfill — all environments are dev/seed
-- only as of 2026-08-22. Against real data this would need each existing row
-- split into a single seed ledger entry before the constraint is dropped.
```

Then apply and `npm run prisma:migrate:test`.

- [ ] **Step 4: Rewrite `recordPayment`**

```typescript
export type RecordPaymentResult =
  | { ok: true; amountPaid: number; status: FeeStatus; receiptNo: string }
  | { ok: false; error: "INVALID_FEE_STRUCTURE" }
  | { ok: false; error: "STUDENT_MISMATCH" }
  | { ok: false; error: "INVALID_AMOUNT" }
  | { ok: false; error: "EXCEEDS_AMOUNT_DUE" };

export async function recordPayment(
  prisma: PrismaClient,
  params: {
    feeStructureId: number;
    studentId: number;
    schoolId: number;
    recordedById: number;
    amount: number;
    mode: PaymentMode;
    reference?: string;
  }
): Promise<RecordPaymentResult> {
  // NOTE: early returns below still COMMIT the transaction (Prisma only rolls back
  // on a thrown error). Every early return here sits BEFORE the single create at the
  // end of the body, so committing an empty transaction is harmless. Any future write
  // added above an early return breaks that and must be reordered or made to throw.
  return prisma.$transaction(
    async (tx) => {
      const feeStructure = await tx.feeStructure.findFirst({
        where: { id: params.feeStructureId, schoolId: params.schoolId },
      });
      if (!feeStructure) return { ok: false, error: "INVALID_FEE_STRUCTURE" };

      const enrollment = await tx.enrollment.findFirst({
        where: {
          studentId: params.studentId,
          classId: feeStructure.classId,
          academicYearId: feeStructure.academicYearId,
          status: "active",
        },
      });
      if (!enrollment) return { ok: false, error: "STUDENT_MISMATCH" };
      if (params.amount <= 0) return { ok: false, error: "INVALID_AMOUNT" };

      const priorTotal = await sumPaid(tx as PrismaClient, {
        studentId: params.studentId,
        feeStructureId: params.feeStructureId,
      });
      const newAmountPaid = priorTotal + params.amount;

      if (newAmountPaid > feeStructure.amount) return { ok: false, error: "EXCEEDS_AMOUNT_DUE" };

      const priorCount = await tx.feePayment.count({
        where: { feeStructureId: params.feeStructureId },
      });
      const receiptNo = `R-${params.feeStructureId}-${String(priorCount + 1).padStart(5, "0")}`;

      await tx.feePayment.create({
        data: {
          studentId: params.studentId,
          feeStructureId: params.feeStructureId,
          amountPaid: params.amount,
          paidDate: new Date(),
          mode: params.mode,
          receiptNo,
          reference: params.reference ?? null,
          recordedById: params.recordedById,
        },
      });

      return {
        ok: true,
        amountPaid: newAmountPaid,
        status: computeFeeStatus(newAmountPaid, feeStructure.amount),
        receiptNo,
      };
    },
    { isolationLevel: "Serializable" }
  );
}
```

`amountPaid` on the created row is `params.amount` — **this instalment**, not the running total. Getting that wrong reintroduces the bug in a form the tests above would catch on the aggregate but not on the row, so re-read this line before moving on.

Receipt numbering derives from a count inside the same `Serializable` transaction, and `@@unique([feeStructureId, receiptNo])` backstops it — two concurrent payments producing the same number cause one transaction to fail, which the route's existing `P2034` retry already handles. Do not move the numbering outside the transaction.

- [ ] **Step 5: Add `sumPaid` and rewrite the roster**

```typescript
async function sumPaid(
  prisma: PrismaClient,
  params: { studentId: number; feeStructureId: number }
): Promise<number> {
  const result = await prisma.feePayment.aggregate({
    where: { studentId: params.studentId, feeStructureId: params.feeStructureId },
    _sum: { amountPaid: true },
  });
  return result._sum.amountPaid ?? 0;
}
```

`getFeeRoster` currently does `payments.find((p) => p.studentId === student.id)` and reads that single row's `amountPaid` and `status`. With multiple rows per student that silently reports only the first instalment. Replace the find with a per-student sum:

```typescript
  const payments = await prisma.feePayment.groupBy({
    by: ["studentId"],
    where: {
      feeStructureId: params.feeStructureId,
      studentId: { in: enrolled.map((student) => student.id) },
    },
    _sum: { amountPaid: true },
  });
  const paidByStudent = new Map(payments.map((p) => [p.studentId, p._sum.amountPaid ?? 0]));

  return {
    ok: true,
    students: enrolled.map((student) => {
      const amountPaid = paidByStudent.get(student.id) ?? 0;
      return {
        studentId: student.id,
        name: student.name,
        amountPaid,
        amount: feeStructure.amount,
        status: computeFeeStatus(amountPaid, feeStructure.amount),
      };
    }),
  };
```

One `groupBy` rather than a query per student keeps the roster at two round-trips regardless of class size.

- [ ] **Step 6: Add `listPaymentsForStudent`**

```typescript
export interface PaymentHistoryEntry {
  id: number;
  amountPaid: number;
  paidDate: string;
  mode: PaymentMode;
  receiptNo: string;
  reference: string | null;
  recordedByName: string;
}

export type ListPaymentsResult =
  | { ok: true; payments: PaymentHistoryEntry[] }
  | { ok: false; error: "INVALID_FEE_STRUCTURE" };

export async function listPaymentsForStudent(
  prisma: PrismaClient,
  params: { studentId: number; feeStructureId: number; schoolId: number }
): Promise<ListPaymentsResult> {
  const feeStructure = await prisma.feeStructure.findFirst({
    where: { id: params.feeStructureId, schoolId: params.schoolId },
  });
  if (!feeStructure) return { ok: false, error: "INVALID_FEE_STRUCTURE" };

  const payments = await prisma.feePayment.findMany({
    where: { studentId: params.studentId, feeStructureId: params.feeStructureId },
    include: { recordedBy: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    ok: true,
    payments: payments.map((p) => ({
      id: p.id,
      amountPaid: p.amountPaid,
      paidDate: p.paidDate.toISOString().slice(0, 10),
      mode: p.mode,
      receiptNo: p.receiptNo,
      reference: p.reference,
      recordedByName: p.recordedBy.name,
    })),
  };
}
```

- [ ] **Step 7: Update the route and every other caller**

Run: `grep -rn "recordPayment\|feePayment\." src/`

The payment route must accept and forward `mode` (required) and `reference` (optional), rejecting a missing or invalid `mode` with a 400. Anything reading `payment.status` off a row must move to `computeFeeStatus` over the sum. Check `src/lib/dashboard/overview.ts` and `src/lib/parent/` in particular — both surface fee figures.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/fee-payments-api.test.ts tests/fees-history.test.ts tests/dashboard-overview.test.ts`

**The concurrency test must still pass.** If it does not, stop and re-read the transaction body rather than adjusting the test.

- [ ] **Step 9: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 10: Commit**

```bash
git add prisma src/lib/fee-payments.ts src/app src/lib/dashboard src/lib/parent tests
git commit -m "feat(fees): convert FeePayment to an append-only ledger (C4)"
```

---

### Task 2: Store money as `Decimal`

`FeePayment.amountPaid` and `FeeStructure.amount` are `Float` (`schema.prisma:405`, `:388`). Instalment sums in binary floating point do not reconcile exactly against a fee structure's total — pay 1000 three times against a 3000 fee and `sumPaid` can return 2999.9999999999995, so `computeFeeStatus` reports `partial` on a fully-paid fee and the `EXCEEDS_AMOUNT_DUE` guard becomes unpredictable at the boundary.

This is the real cause of the "float tails" the audit filed under front-end formatting. Formatting a `Float` correctly only hides it.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`FeeStructure.amount`, `FeePayment.amountPaid`)
- Create: migration (generated), `apps/web/src/lib/money.ts`
- Modify: `apps/web/src/lib/fee-payments.ts`, `src/lib/fee-structures.ts`
- Test: `apps/web/tests/money.test.ts` (create), `tests/fee-payments-api.test.ts`

**Interfaces:**
- Produces: `src/lib/money.ts` exporting `toNumber(value: Prisma.Decimal | number): number` and `formatMoney(value: Prisma.Decimal | number): string`.

- [ ] **Step 1: Write the failing test**

```typescript
it("reconciles instalments exactly against the fee total", async () => {
  // feeStructure.amount is 3000 in this fixture
  await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 1000, mode: "cash" });
  await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 1000, mode: "cash" });
  const third = await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 1000, mode: "cash" });

  expect(third).toMatchObject({ ok: true, status: "paid" });

  const roster = await getFeeRoster(prisma, { feeStructureId, schoolId });
  expect(roster.ok).toBe(true);
  if (!roster.ok) return;
  const row = roster.students.find((s) => s.studentId === studentId)!;
  expect(row.amountPaid).toBe(3000);
  expect(row.status).toBe("paid");
});

it("reconciles amounts with paise exactly", async () => {
  // a fee structure of 1000.10, paid as 333.37 + 333.37 + 333.36
  await recordPayment(prisma, { feeStructureId: pennyFeeId, studentId, schoolId, recordedById: accountantId, amount: 333.37, mode: "cash" });
  await recordPayment(prisma, { feeStructureId: pennyFeeId, studentId, schoolId, recordedById: accountantId, amount: 333.37, mode: "cash" });
  const third = await recordPayment(prisma, { feeStructureId: pennyFeeId, studentId, schoolId, recordedById: accountantId, amount: 333.36, mode: "cash" });

  expect(third).toMatchObject({ ok: true, status: "paid" });
});
```

The second test is the one that fails on `Float` and passes on `Decimal`. Verify that before implementing — if it passes with `Float`, pick amounts that genuinely produce a representation error and use those.

In `tests/money.test.ts`:

```typescript
it("formats rupee amounts with separators and two decimals", () => {
  expect(formatMoney(1234567.5)).toBe("₹12,34,567.50");
  expect(formatMoney(0)).toBe("₹0.00");
  expect(formatMoney(999)).toBe("₹999.00");
});
```

The expected output uses the Indian digit grouping (`en-IN`), matching the product's market. If the team wants Western grouping, change the locale in the implementation and this expectation together.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/money.test.ts`

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Change the column types**

```prisma
  amount         Decimal      @db.Decimal(12, 2)
```

in `FeeStructure`, and

```prisma
  amountPaid     Decimal      @db.Decimal(12, 2)
```

in `FeePayment`.

`Decimal(12, 2)` holds up to 9,999,999,999.99 — ample for a school fee, and the scale of 2 makes paise exact.

Migrate as before, deleting any stray `DROP INDEX` line. Postgres converts `double precision` to `numeric` in place, so no data step is needed even if rows exist.

- [ ] **Step 4: Write `src/lib/money.ts`**

```typescript
import { Prisma } from "@prisma/client";

export function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

export function formatMoney(value: Prisma.Decimal | number): string {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

`toNumber` exists so the boundary conversion happens in exactly one place. Arithmetic on money stays in the database or in `Prisma.Decimal`; `toNumber` is for handing a value to the UI, never for adding two of them together.

- [ ] **Step 5: Handle `Decimal` at every read boundary**

Prisma returns `Prisma.Decimal` for these columns now, and `tsc` will point at every site that assumed `number`. Work through them:

- `sumPaid` — `result._sum.amountPaid` is `Decimal | null`. Return a `Decimal`: `result._sum.amountPaid ?? new Prisma.Decimal(0)`.
- The `EXCEEDS_AMOUNT_DUE` comparison — use `Decimal` arithmetic, not JavaScript `+` and `>`:
  ```typescript
  const newAmountPaid = priorTotal.add(new Prisma.Decimal(params.amount));
  if (newAmountPaid.greaterThan(feeStructure.amount)) return { ok: false, error: "EXCEEDS_AMOUNT_DUE" };
  ```
  This is the whole point of the task. A `toNumber()` on either side here reintroduces the bug.
- `computeFeeStatus` — widen to accept `Decimal`:
  ```typescript
  export function computeFeeStatus(
    amountPaid: Prisma.Decimal,
    amount: Prisma.Decimal
  ): FeeStatus {
    if (amountPaid.lessThanOrEqualTo(0)) return "unpaid";
    if (amountPaid.lessThan(amount)) return "partial";
    return "paid";
  }
  ```
- Result types and interfaces that surface money to the UI — `FeeRosterEntry`, `PaymentHistoryEntry`, `RecordPaymentResult`, `FeeStructureSummary` — keep `number` and call `toNumber()` at the mapping step. The UI never sees a `Decimal`.
- `getFeeRoster`'s `groupBy` sum is a `Decimal`; convert per row with `toNumber()` after computing the status in `Decimal`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/money.test.ts tests/fee-payments-api.test.ts tests/fee-structures-api.test.ts tests/fees-history.test.ts`

- [ ] **Step 7: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib tests
git commit -m "fix(fees): store money as Decimal and add a money formatter"
```

---

### Task 3: Add `overdue` and make status date-aware

`FeeStatus` is `paid · partial · unpaid` and `computeFeeStatus` never looks at `dueDate`, so nothing in the system can drive a dunning sequence or show an accountant which fees are actually late.

**Files:**
- Modify: `apps/web/prisma/schema.prisma:35-39`
- Create: migration (generated)
- Modify: `apps/web/src/lib/fee-payments.ts` (`computeFeeStatus`)
- Test: `apps/web/tests/fee-payments-api.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
it("reports an unpaid fee past its due date as overdue", () => {
  const status = computeFeeStatus(
    new Prisma.Decimal(0),
    new Prisma.Decimal(5000),
    new Date("2026-01-01"),
    new Date("2026-06-01")
  );
  expect(status).toBe("overdue");
});

it("reports a partly-paid fee past its due date as overdue", () => {
  const status = computeFeeStatus(
    new Prisma.Decimal(2000),
    new Prisma.Decimal(5000),
    new Date("2026-01-01"),
    new Date("2026-06-01")
  );
  expect(status).toBe("overdue");
});

it("reports a fully-paid fee past its due date as paid", () => {
  const status = computeFeeStatus(
    new Prisma.Decimal(5000),
    new Prisma.Decimal(5000),
    new Date("2026-01-01"),
    new Date("2026-06-01")
  );
  expect(status).toBe("paid");
});

it("reports an unpaid fee before its due date as unpaid", () => {
  const status = computeFeeStatus(
    new Prisma.Decimal(0),
    new Prisma.Decimal(5000),
    new Date("2026-12-01"),
    new Date("2026-06-01")
  );
  expect(status).toBe("unpaid");
});
```

Passing "now" as an explicit fourth parameter rather than calling `new Date()` inside is what makes these tests deterministic. Do not use fake timers here.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fee-payments-api.test.ts -t "overdue"`

- [ ] **Step 3: Add the enum value**

```prisma
enum FeeStatus {
  paid
  partial
  unpaid
  overdue
}
```

Migrate as before. Postgres may refuse `ALTER TYPE ... ADD VALUE` inside a transaction block — if so, ensure the statement stands alone in the migration file.

- [ ] **Step 4: Make `computeFeeStatus` date-aware**

```typescript
export function computeFeeStatus(
  amountPaid: Prisma.Decimal,
  amount: Prisma.Decimal,
  dueDate: Date,
  now: Date = new Date()
): FeeStatus {
  if (amountPaid.greaterThanOrEqualTo(amount)) return "paid";
  if (now > dueDate) return "overdue";
  if (amountPaid.lessThanOrEqualTo(0)) return "unpaid";
  return "partial";
}
```

`paid` is checked first and unconditionally: a fee settled after its due date is paid, not overdue. `overdue` then supersedes both `unpaid` and `partial`, because an accountant chasing money cares more about lateness than about whether a token amount has arrived.

- [ ] **Step 5: Update every caller**

`grep -rn "computeFeeStatus" src/` — each site now needs the fee structure's `dueDate`, which every one of them already has in scope. Do not add a default.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/fee-payments-api.test.ts tests/fees-history.test.ts tests/dashboard-overview.test.ts`

- [ ] **Step 7: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib tests
git commit -m "feat(fees): add overdue status driven by due date"
```

---

### Task 4: Add discounts and fines to `FeeStructure`

`FeeStructure` is a flat per-student `amount` with no waiver mechanism and no late-fee computation.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`FeeStructure`)
- Create: migration (generated)
- Modify: `apps/web/src/lib/fee-structures.ts`, `src/lib/fee-payments.ts`
- Test: `apps/web/tests/fee-structures-api.test.ts`

**Interfaces:**
- Produces: `FeeStructure.discount Decimal @db.Decimal(12,2) @default(0)`, `FeeStructure.fineAmount Decimal @db.Decimal(12,2) @default(0)`.
- Produces: `netAmountDue(feeStructure, now): Prisma.Decimal` in `src/lib/fee-payments.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
it("subtracts the discount from the amount due", () => {
  const due = netAmountDue(
    { amount: new Prisma.Decimal(5000), discount: new Prisma.Decimal(500), fineAmount: new Prisma.Decimal(0), dueDate: new Date("2026-12-01") },
    new Date("2026-06-01")
  );
  expect(due.toNumber()).toBe(4500);
});

it("adds the fine once the due date has passed", () => {
  const due = netAmountDue(
    { amount: new Prisma.Decimal(5000), discount: new Prisma.Decimal(0), fineAmount: new Prisma.Decimal(200), dueDate: new Date("2026-01-01") },
    new Date("2026-06-01")
  );
  expect(due.toNumber()).toBe(5200);
});

it("does not add the fine before the due date", () => {
  const due = netAmountDue(
    { amount: new Prisma.Decimal(5000), discount: new Prisma.Decimal(0), fineAmount: new Prisma.Decimal(200), dueDate: new Date("2026-12-01") },
    new Date("2026-06-01")
  );
  expect(due.toNumber()).toBe(5000);
});

it("lets a payment cover the fine without triggering EXCEEDS_AMOUNT_DUE", async () => {
  // a fee structure of 5000 with a 200 fine, past its due date
  const result = await recordPayment(prisma, {
    feeStructureId: overdueFeeId, studentId, schoolId, recordedById: accountantId, amount: 5200, mode: "cash",
  });
  expect(result).toMatchObject({ ok: true, status: "paid" });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fee-structures-api.test.ts -t "discount"`

- [ ] **Step 3: Add the columns**

```prisma
  discount       Decimal      @default(0) @db.Decimal(12, 2)
  fineAmount     Decimal      @default(0) @db.Decimal(12, 2)
```

Defaults of 0 mean every existing structure keeps its current behaviour. Migrate as before.

- [ ] **Step 4: Add `netAmountDue`**

```typescript
export function netAmountDue(
  feeStructure: {
    amount: Prisma.Decimal;
    discount: Prisma.Decimal;
    fineAmount: Prisma.Decimal;
    dueDate: Date;
  },
  now: Date = new Date()
): Prisma.Decimal {
  const base = feeStructure.amount.minus(feeStructure.discount);
  return now > feeStructure.dueDate ? base.add(feeStructure.fineAmount) : base;
}
```

- [ ] **Step 5: Use it everywhere the raw `amount` was the ceiling**

In `recordPayment`, the `EXCEEDS_AMOUNT_DUE` comparison and the `computeFeeStatus` call must both use `netAmountDue(feeStructure)` rather than `feeStructure.amount`. Same in `getFeeRoster`. Otherwise a school with a fine configured can never accept full payment.

Expose `discount` and `fineAmount` on `createFeeStructure`'s input (both optional, defaulting to 0) and in the fee structure form.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/fee-structures-api.test.ts tests/fee-payments-api.test.ts`

- [ ] **Step 7: Full suite, typecheck, build, reseed**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20 && npm run seed`

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib src/components tests
git commit -m "feat(fees): add per-structure discount and late fine"
```

---

### Task 5: Show the ledger and the new fields in the UI

The service layer now records instalments, modes, references and receipt numbers, and none of it is visible or enterable.

**Files:**
- Modify: the fees components (`ls src/components/fees`)
- Create: `apps/web/src/app/api/fee-payments/history/route.ts` or equivalent, exposing `listPaymentsForStudent`
- Test: `apps/web/tests/fees-view.test.tsx` (confirm the filename)

- [ ] **Step 1: Write the failing test**

```typescript
it("requires a payment mode before submitting", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(/* fees view with one student owing 5000 */);

  await userEvent.type(screen.getByLabelText(/amount/i), "2000");
  await userEvent.click(screen.getByRole("button", { name: /record payment/i }));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText(/select a payment mode/i)).toBeInTheDocument();
});

it("sends mode and reference with the payment", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ amountPaid: 2000, status: "partial", receiptNo: "R-1-00001" }),
  });
  vi.stubGlobal("fetch", fetchMock);

  render(/* same */);

  await userEvent.type(screen.getByLabelText(/amount/i), "2000");
  await userEvent.selectOptions(screen.getByLabelText(/payment mode/i), "upi");
  await userEvent.type(screen.getByLabelText(/reference/i), "UPI-9981");
  await userEvent.click(screen.getByRole("button", { name: /record payment/i }));

  const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
  expect(body.mode).toBe("upi");
  expect(body.reference).toBe("UPI-9981");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fees-view.test.tsx -t "payment mode"`

- [ ] **Step 3: Add the inputs**

A required `<select>` for mode with the six `PaymentMode` values, and an optional text input for reference. Block submission with a message when no mode is chosen — the server rejects a missing mode with a 400 anyway, but making the accountant round-trip for it is poor.

- [ ] **Step 4: Add the instalment history**

Render each student's payment history — date, amount, mode, receipt number, reference, who recorded it — from `listPaymentsForStudent`. This is the audit's actual complaint made good: a school can now answer "who took this cash and when".

Use `formatMoney` from Task 2 for every amount.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/fees-view.test.tsx tests/fees-history.test.ts`

- [ ] **Step 6: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npm run build && npm test 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components src/app tests
git commit -m "feat(fees): add mode, reference and instalment history to the UI"
```

---

### Task 6: Apply `formatMoney` everywhere money renders

The audit found money rendering as `₹{amount}` with no separators and possible float tails. Task 2 built the formatter; this task applies it.

**Files:**
- Modify: every component rendering a currency amount
- Test: whichever view tests cover those components

- [ ] **Step 1: Find every site**

Run: `grep -rn '₹' src/`

Also check for amounts rendered without the symbol — `grep -rn "amount\|amountPaid\|feesOutstanding" src/components src/app`.

- [ ] **Step 2: Write a failing test for one representative site**

Pick the fees roster and assert the formatted output:

```typescript
it("renders amounts with separators and two decimals", () => {
  render(/* fees roster with a student owing 1234567.5 */);
  expect(screen.getByText("₹12,34,567.50")).toBeInTheDocument();
});
```

- [ ] **Step 3: Replace every interpolation**

`{`₹${amount}`}` becomes `{formatMoney(amount)}`. Delete the literal `₹` from the JSX at each site — `formatMoney` supplies it, and leaving both produces `₹₹`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -20`

- [ ] **Step 5: Verify visually**

Run the dev server and check the fees page, the dashboard fee tile and the parent fees page. `grep -rn '₹' src/` afterwards should return only `src/lib/money.ts`.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "style(fees): render all money through the shared formatter"
```

---

## Phase 5 Exit Criteria

- [ ] Two instalments against one fee produce two `FeePayment` rows, each with its own date, mode, receipt number and recorder.
- [ ] The first instalment's date and recorder survive the second — verified by reading both rows.
- [ ] A receipt can be produced from stored data alone: number, amount, date, mode, reference, recorded-by name.
- [ ] Three payments of 333.37 + 333.37 + 333.36 against a 1000.10 fee reconcile to `paid` with no residue.
- [ ] `EXCEEDS_AMOUNT_DUE` still fires, computed from the ledger sum against the net amount due, and a rejected payment appends no row.
- [ ] **The fee concurrency test passes unchanged.** `Serializable` isolation and the route's `P2034` retry are intact — confirm by reading the transaction options, not by assuming.
- [ ] An unpaid fee past its due date reports `overdue`; a fully-paid one past its due date reports `paid`.
- [ ] A fine is added to the amount due only after the due date, and a payment covering it is accepted.
- [ ] `grep -rn '₹' src/` returns only `src/lib/money.ts`.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm test`, `npm run seed` all clean.

## What Phase 5 deliberately leaves open

- **No receipt document.** The data to print one now exists; rendering a PDF or a print view does not. That is a feature, not a finding.
- **No dunning sequence.** `overdue` is computable but nothing acts on it — no reminder notification, no report. The notification channel work is Phase 7a.
- **Scholarships are a flat discount.** A per-student waiver, as opposed to a per-structure one, is not modelled. The audit asks only for "discount/scholarship" on `FeeStructure`, which this delivers.
