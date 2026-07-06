import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getFeePayments } from "../src/app/api/fee-payments/route";

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
    const klass = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 5", section: "A" },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: "Test Student",
        dob: new Date("2016-01-01"),
        classId: klass.id,
        section: "A",
        admissionNo: "SCH-900",
      },
    });
    const feeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: new Date("2026-09-01"),
      },
    });
    return { school, klass, student, feeStructure };
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
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Grade 1", section: "A" },
    });
    const otherFeeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: otherSchool.id,
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
