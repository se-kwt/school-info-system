import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createActiveYear, createClass, createEnrolledStudent } from "./helpers/enrollment";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getFeePayments, POST as postFeePayments } from "../src/app/api/fee-payments/route";
import { recordPayment, listPaymentsForStudent, getFeeRoster, computeFeeStatus } from "../src/lib/fee-payments";
import { Prisma } from "@prisma/client";

describe("computeFeeStatus", () => {
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
});

describe("GET /api/fee-payments", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedSchoolWithFeeStructure() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-900",
    });
    const feeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: new Date("2026-09-01"),
      },
    });
    return { school, year, klass, student, feeStructure };
  }

  function loginAs(userId: number, role: "admin" | "accountant", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("returns amountPaid 0 and status unpaid for a student with no FeePayment row", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550101111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/fee-payments?feeStructureId=${feeStructure.id}`
    );
    const response = await getFeePayments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.students).toEqual([
      { studentId: student.id, name: "Test Student", amountPaid: 0, amount: 5000, status: "unpaid" },
    ]);
  });

  it("returns the correct amountPaid and status for an existing row", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550102222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    await prisma.feePayment.create({
      data: {
        studentId: student.id,
        feeStructureId: feeStructure.id,
        amountPaid: 3000,
        paidDate: new Date(),
        mode: "cash",
        receiptNo: "R-TEST-0001",
        recordedById: admin.id,
      },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/fee-payments?feeStructureId=${feeStructure.id}`
    );
    const response = await getFeePayments(request);
    const body = await response.json();
    expect(body.students[0]).toMatchObject({ amountPaid: 3000, amount: 5000, status: "partial" });
  });

  it("allows an accountant to view the roster", async () => {
    const { school, feeStructure } = await seedSchoolWithFeeStructure();
    const accountant = await prisma.user.create({
      data: { phone: "+15550103333", role: "accountant", name: "Test Accountant", schoolId: school.id },
    });
    loginAs(accountant.id, "accountant", school.id);

    const request = new Request(
      `http://localhost/api/fee-payments?feeStructureId=${feeStructure.id}`
    );
    const response = await getFeePayments(request);
    expect(response.status).toBe(200);
  });

  it("rejects a feeStructureId from a different school with 400", async () => {
    const { school } = await seedSchoolWithFeeStructure();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id, "2026-27-other");
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
    const otherFeeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: otherSchool.id,
        academicYearId: otherYear.id,
        classId: otherClass.id,
        term: "Term 1",
        amount: 1000,
        dueDate: new Date("2026-09-01"),
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550104444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(
      `http://localhost/api/fee-payments?feeStructureId=${otherFeeStructure.id}`
    );
    const response = await getFeePayments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a missing feeStructureId with 400", async () => {
    const { school } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550105555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments");
    const response = await getFeePayments(request);
    expect(response.status).toBe(400);
  });
});

describe("POST /api/fee-payments", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedSchoolWithFeeStructure() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Test Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-901",
    });
    const feeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: new Date("2026-09-01"),
      },
    });
    return { school, year, klass, student, feeStructure };
  }

  function loginAs(userId: number, role: "admin" | "accountant", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a FeePayment row on the first payment with status unpaid or partial", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550111111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 2000, mode: "cash" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ amountPaid: 2000, status: "partial" });

    const payment = await prisma.feePayment.findFirst({ where: { studentId: student.id } });
    expect(payment).toMatchObject({ mode: "cash" });
    expect(Number(payment?.amountPaid)).toBe(2000);
  });

  it("adds cumulatively and recomputes status through unpaid to partial to paid, keeping each instalment as its own row", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550112222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    async function pay(amount: number) {
      const request = new Request("http://localhost/api/fee-payments", {
        method: "POST",
        body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount, mode: "cash" }),
        headers: { "content-type": "application/json" },
      });
      return postFeePayments(request);
    }

    const first = await pay(2000);
    expect((await first.json())).toMatchObject({ amountPaid: 2000, status: "partial" });

    const second = await pay(3000);
    expect((await second.json())).toMatchObject({ amountPaid: 5000, status: "paid" });

    const rows = await prisma.feePayment.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].amountPaid)).toBe(2000);
    expect(Number(rows[1].amountPaid)).toBe(3000);
  });

  it("rejects a payment that would exceed the amount due with 400, no row created", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550113333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 6000, mode: "cash" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(400);

    const payment = await prisma.feePayment.findFirst({ where: { studentId: student.id } });
    expect(payment).toBeNull();
  });

  it("rejects a follow-up payment that would exceed the amount due with 400, existing row unchanged", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550114444", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    async function pay(amount: number) {
      const request = new Request("http://localhost/api/fee-payments", {
        method: "POST",
        body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount, mode: "cash" }),
        headers: { "content-type": "application/json" },
      });
      return postFeePayments(request);
    }

    await pay(4000);
    const secondResponse = await pay(2000);
    expect(secondResponse.status).toBe(400);

    const rows = await prisma.feePayment.findMany({ where: { studentId: student.id } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amountPaid)).toBe(4000);
  });

  it("rejects a POST missing mode with 400", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550119999", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 1000 }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(400);

    const payment = await prisma.feePayment.findFirst({ where: { studentId: student.id } });
    expect(payment).toBeNull();
  });

  it("rejects a POST with an invalid mode with 400", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550119998", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 1000, mode: "bitcoin" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a studentId that doesn't belong to the fee structure's class with 400", async () => {
    const { school, year, feeStructure } = await seedSchoolWithFeeStructure();
    const otherClass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 6", section: "B" });
    const otherStudent = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: otherClass.id,
      academicYearId: year.id,
      name: "Other Student",
      dob: new Date("2015-01-01"),
      admissionNo: "SCH-902",
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550115555", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({
        feeStructureId: feeStructure.id,
        studentId: otherStudent.id,
        amount: 1000,
        mode: "cash",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a non-positive amount with 400", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550116666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 0, mode: "cash" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(400);
  });

  it("rejects a feeStructureId from a different school with 400", async () => {
    const { school, student } = await seedSchoolWithFeeStructure();
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id, "2026-27-other");
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
    const otherFeeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: otherSchool.id,
        academicYearId: otherYear.id,
        classId: otherClass.id,
        term: "Term 1",
        amount: 1000,
        dueDate: new Date("2026-09-01"),
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550117777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({
        feeStructureId: otherFeeStructure.id,
        studentId: student.id,
        amount: 500,
        mode: "cash",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(400);
  });

  it("allows an accountant to record a payment", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const accountant = await prisma.user.create({
      data: { phone: "+15550118888", role: "accountant", name: "Test Accountant", schoolId: school.id },
    });
    loginAs(accountant.id, "accountant", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 5000, mode: "upi", reference: "UPI-1234" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ amountPaid: 5000, status: "paid" });

    const payment = await prisma.feePayment.findFirst({ where: { studentId: student.id } });
    expect(payment).toMatchObject({ mode: "upi", reference: "UPI-1234" });
    expect(Number(payment?.amountPaid)).toBe(5000);
  });

  it("does not lose a payment when two POSTs race on the same student/fee", async () => {
    // This is the concurrency regression guard: `recordPayment` runs its
    // read-check-write sequence inside a single Serializable transaction, and
    // the route retries once on Prisma's P2034 serialization-failure code.
    // Under the ledger model each accepted payment appends its own row, so a
    // "payment not lost" assertion is: two rows exist and their amounts sum
    // to the total, not that a single upserted row reached the total.
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550114445", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    function pay(amount: number) {
      const request = new Request("http://localhost/api/fee-payments", {
        method: "POST",
        body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount, mode: "cash" }),
        headers: { "content-type": "application/json" },
      });
      return postFeePayments(request);
    }

    const [r1, r2] = await Promise.all([pay(2000), pay(3000)]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const rows = await prisma.feePayment.findMany({ where: { studentId: student.id } });
    expect(rows).toHaveLength(2); // both payments must be reflected, not just the last writer's
    const total = rows.reduce((sum, r) => sum + Number(r.amountPaid), 0);
    expect(total).toBe(5000);
    expect(new Set(rows.map((r) => Number(r.amountPaid)))).toEqual(new Set([2000, 3000]));
    // Receipt numbering (`tx.feePayment.count()` inside the same Serializable
    // transaction) races exactly like the amount check does. If two concurrent
    // transactions both computed the same `priorCount` and thus the same
    // receiptNo, the `@@unique([feeStructureId, receiptNo])` constraint would
    // make the losing transaction fail with P2034, which the route retries —
    // the retry re-reads the count (now incremented by the winner) and gets a
    // fresh, distinct number. So a passing test here (distinct receipt numbers
    // even though both POSTs were fired concurrently) is evidence the retry
    // path was actually exercised for the receipt-number race, not just the
    // amount race.
    expect(new Set(rows.map((r) => r.receiptNo)).size).toBe(2);
  });
});

describe("recordPayment / listPaymentsForStudent (ledger)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function seedFixtures(amount: number = 5000) {
    const school = await prisma.school.create({ data: { name: "Ledger Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Ledger Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-950",
    });
    const feeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        classId: klass.id,
        term: "Term 1",
        amount,
        dueDate: new Date("2026-09-01"),
      },
    });
    const accountant = await prisma.user.create({
      data: { phone: "+15550120001", role: "accountant", name: "First Accountant", schoolId: school.id },
    });
    const secondAccountant = await prisma.user.create({
      data: { phone: "+15550120002", role: "accountant", name: "Second Accountant", schoolId: school.id },
    });
    return {
      schoolId: school.id,
      feeStructureId: feeStructure.id,
      studentId: student.id,
      accountantId: accountant.id,
      secondAccountantId: secondAccountant.id,
    };
  }

  it("keeps every instalment as its own row", async () => {
    const { feeStructureId, studentId, schoolId, accountantId, secondAccountantId } = await seedFixtures();

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
    const { feeStructureId, studentId, schoolId, accountantId } = await seedFixtures();

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
    const { feeStructureId, studentId, schoolId, accountantId } = await seedFixtures();

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
    const { feeStructureId, studentId, schoolId, accountantId } = await seedFixtures();

    await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 1000, mode: "cash" });
    await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 1000, mode: "cash" });

    const rows = await prisma.feePayment.findMany({ where: { studentId, feeStructureId } });
    const receipts = rows.map((r) => r.receiptNo);

    expect(new Set(receipts).size).toBe(2);
    expect(receipts.every((r) => typeof r === "string" && r.length > 0)).toBe(true);
  });

  it("enforces receiptNo uniqueness per fee structure at the database level", async () => {
    // Direct proof that `@@unique([feeStructureId, receiptNo])` is a real DB
    // constraint, independent of `recordPayment`'s in-transaction counting.
    // This is what a concurrent race that produces the same computed
    // receiptNo twice would actually hit: the losing `tx.feePayment.create`
    // fails with Prisma P2002 (unique constraint violation) inside the
    // Serializable transaction, which surfaces to the caller as a
    // transaction failure (P2034/P2028-style conflict) that the route's
    // `recordPaymentWithRetry` already retries — the same retry mechanism
    // proven for the amount-overpayment race in
    // "does not lose a payment when two POSTs race on the same student/fee"
    // above, and now shown here to also cover a receipt-number collision on
    // the same unique index.
    const { feeStructureId, studentId, schoolId, accountantId } = await seedFixtures();

    await prisma.feePayment.create({
      data: {
        studentId,
        feeStructureId,
        amountPaid: 1000,
        paidDate: new Date(),
        mode: "cash",
        receiptNo: "R-COLLIDE-0001",
        recordedById: accountantId,
      },
    });

    let caught: unknown;
    try {
      await prisma.feePayment.create({
        data: {
          studentId,
          feeStructureId,
          amountPaid: 500,
          paidDate: new Date(),
          mode: "cash",
          receiptNo: "R-COLLIDE-0001",
          recordedById: accountantId,
        },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((caught as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");

    const rows = await prisma.feePayment.findMany({ where: { studentId, feeStructureId } });
    expect(rows).toHaveLength(1); // the colliding second create never committed
  });

  it("returns the full instalment history for a student", async () => {
    const { feeStructureId, studentId, schoolId, accountantId } = await seedFixtures();

    await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 2000, mode: "cash" });
    await recordPayment(prisma, { feeStructureId, studentId, schoolId, recordedById: accountantId, amount: 3000, mode: "cheque", reference: "CHQ-4412" });

    const result = await listPaymentsForStudent(prisma, { studentId, feeStructureId, schoolId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payments).toHaveLength(2);
    expect(result.payments[1].reference).toBe("CHQ-4412");
  });

  it("reconciles instalments exactly against the fee total", async () => {
    // feeStructure.amount is 3000 in this fixture
    const { feeStructureId, studentId, schoolId, accountantId } = await seedFixtures(3000);

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
    // a fee structure of 3300.30, paid as three instalments of 1100.10.
    // Verified against `Number` before writing this test: under binary
    // floating point, 0 + 1100.10 + 1100.10 + 1100.10 === 3300.2999999999997,
    // which is strictly LESS than 3300.3000000000002 (the Float
    // representation of the fee total) — so on a `Float` column the third
    // instalment would be misreported as "partial" on a fully-paid fee,
    // exactly the "float tail" bug this task fixes. `Decimal(12, 2)`
    // reconciles the three instalments to precisely the fee total.
    const { feeStructureId: pennyFeeId, studentId, schoolId, accountantId } = await seedFixtures(3300.3);

    await recordPayment(prisma, { feeStructureId: pennyFeeId, studentId, schoolId, recordedById: accountantId, amount: 1100.1, mode: "cash" });
    await recordPayment(prisma, { feeStructureId: pennyFeeId, studentId, schoolId, recordedById: accountantId, amount: 1100.1, mode: "cash" });
    const third = await recordPayment(prisma, { feeStructureId: pennyFeeId, studentId, schoolId, recordedById: accountantId, amount: 1100.1, mode: "cash" });

    expect(third).toMatchObject({ ok: true, status: "paid" });
  });
});
