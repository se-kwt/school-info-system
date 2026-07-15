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
        status: "partial",
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
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 2000 }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ amountPaid: 2000, status: "partial" });

    const payment = await prisma.feePayment.findFirst({ where: { studentId: student.id } });
    expect(payment).toMatchObject({ amountPaid: 2000, status: "partial" });
  });

  it("adds cumulatively and recomputes status through unpaid to partial to paid", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550112222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    async function pay(amount: number) {
      const request = new Request("http://localhost/api/fee-payments", {
        method: "POST",
        body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount }),
        headers: { "content-type": "application/json" },
      });
      return postFeePayments(request);
    }

    const first = await pay(2000);
    expect((await first.json())).toEqual({ amountPaid: 2000, status: "partial" });

    const second = await pay(3000);
    expect((await second.json())).toEqual({ amountPaid: 5000, status: "paid" });

    const rows = await prisma.feePayment.findMany({ where: { studentId: student.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountPaid: 5000, status: "paid" });
  });

  it("rejects a payment that would exceed the amount due with 400, no row created", async () => {
    const { school, student, feeStructure } = await seedSchoolWithFeeStructure();
    const admin = await prisma.user.create({
      data: { phone: "+15550113333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-payments", {
      method: "POST",
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 6000 }),
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
        body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount }),
        headers: { "content-type": "application/json" },
      });
      return postFeePayments(request);
    }

    await pay(4000);
    const secondResponse = await pay(2000);
    expect(secondResponse.status).toBe(400);

    const payment = await prisma.feePayment.findFirst({ where: { studentId: student.id } });
    expect(payment?.amountPaid).toBe(4000);
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
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 0 }),
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
      body: JSON.stringify({ feeStructureId: feeStructure.id, studentId: student.id, amount: 5000 }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeePayments(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ amountPaid: 5000, status: "paid" });
  });
});
