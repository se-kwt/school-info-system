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
import {
  GET as getFeeStructures,
  POST as postFeeStructures,
} from "../src/app/api/fee-structures/route";
import { listFeeStructures } from "../src/lib/fee-structures";
import { netAmountDue, recordPayment } from "../src/lib/fee-payments";
import { Prisma } from "@prisma/client";

describe("/api/fee-structures", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  function loginAs(userId: number, role: "admin" | "accountant", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a fee structure and lists it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const admin = await prisma.user.create({
      data: { phone: "+15550091111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const postRequest = new Request("http://localhost/api/fee-structures", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, term: "Term 1", amount: 5000, dueDate: "2026-09-01" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postFeeStructures(postRequest);
    expect(postResponse.status).toBe(200);
    const created = await postResponse.json();
    expect(created.id).toBeTypeOf("number");

    const getRequest = new Request(`http://localhost/api/fee-structures?classId=${klass.id}`);
    const getResponse = await getFeeStructures(getRequest);
    expect(getResponse.status).toBe(200);
    const body = await getResponse.json();
    expect(body.feeStructures).toEqual([
      { id: created.id, term: "Term 1", amount: 5000, dueDate: "2026-09-01" },
    ]);
  });

  it("rejects a missing field with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const admin = await prisma.user.create({
      data: { phone: "+15550092222", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-structures", {
      method: "POST",
      body: JSON.stringify({ classId: klass.id, term: "Term 1" }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeeStructures(request);
    expect(response.status).toBe(400);
  });

  it("rejects a negative discount with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const admin = await prisma.user.create({
      data: { phone: "+15550092223", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-structures", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: "2026-09-01",
        discount: -100,
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeeStructures(request);
    expect(response.status).toBe(400);
  });

  it("rejects a negative fine amount with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const admin = await prisma.user.create({
      data: { phone: "+15550092224", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-structures", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: "2026-09-01",
        fineAmount: -50,
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeeStructures(request);
    expect(response.status).toBe(400);
  });

  it("rejects a discount greater than the amount with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const admin = await prisma.user.create({
      data: { phone: "+15550092225", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-structures", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: "2026-09-01",
        discount: 5001,
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeeStructures(request);
    expect(response.status).toBe(400);
  });

  it("rejects a classId from a different school with 400 on create", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
    const admin = await prisma.user.create({
      data: { phone: "+15550093333", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-structures", {
      method: "POST",
      body: JSON.stringify({
        classId: otherClass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: "2026-09-01",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeeStructures(request);
    expect(response.status).toBe(400);
  });

  it("rejects an accountant attempting to POST with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const accountant = await prisma.user.create({
      data: { phone: "+15550094444", role: "accountant", name: "Test Accountant", schoolId: school.id },
    });
    loginAs(accountant.id, "accountant", school.id);

    const request = new Request("http://localhost/api/fee-structures", {
      method: "POST",
      body: JSON.stringify({
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: "2026-09-01",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeeStructures(request);
    expect(response.status).toBe(403);
  });

  it("allows an accountant to GET the list", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: new Date("2026-09-01"),
      },
    });
    const accountant = await prisma.user.create({
      data: { phone: "+15550095555", role: "accountant", name: "Test Accountant", schoolId: school.id },
    });
    loginAs(accountant.id, "accountant", school.id);

    const request = new Request(`http://localhost/api/fee-structures?classId=${klass.id}`);
    const response = await getFeeStructures(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.feeStructures).toHaveLength(1);
  });

  it("rejects a classId from a different school with 400 on GET", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } });
    const otherYear = await createActiveYear(prisma, otherSchool.id);
    const otherClass = await createClass(prisma, { schoolId: otherSchool.id, academicYearId: otherYear.id, name: "Grade 1", section: "A" });
    const admin = await prisma.user.create({
      data: { phone: "+15550096666", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/fee-structures?classId=${otherClass.id}`);
    const response = await getFeeStructures(request);
    expect(response.status).toBe(400);
  });

  it("rejects a classId from a different year with 400 on create", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await createActiveYear(prisma, school.id);
    const staleYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2025-26",
        startDate: new Date("2025-04-01"),
        endDate: new Date("2026-03-31"),
        status: "archived",
      },
    });
    const staleClass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: staleYear.id,
      name: "Grade 5",
      section: "A",
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550098888", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-structures", {
      method: "POST",
      body: JSON.stringify({
        classId: staleClass.id,
        term: "Term 1",
        amount: 5000,
        dueDate: "2026-06-01",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postFeeStructures(request);
    expect(response.status).toBe(400);
    expect(await prisma.feeStructure.count({ where: { classId: staleClass.id } })).toBe(0);
  });

  it("lists only the requested year's fee structures", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const activeYear = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: activeYear.id,
      name: "Grade 5",
      section: "A",
    });
    const staleYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2025-26",
        startDate: new Date("2025-04-01"),
        endDate: new Date("2026-03-31"),
        status: "archived",
      },
    });
    await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        academicYearId: staleYear.id,
        classId: klass.id,
        term: "Old Term",
        amount: 100,
        dueDate: new Date("2025-06-01"),
      },
    });
    await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        academicYearId: activeYear.id,
        classId: klass.id,
        term: "Current Term",
        amount: 200,
        dueDate: new Date("2026-06-01"),
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550099999", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request(`http://localhost/api/fee-structures?classId=${klass.id}`);
    const response = await getFeeStructures(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.feeStructures.map((f: { term: string }) => f.term)).toEqual(["Current Term"]);
  });

  it("listFeeStructures rejects a class that belongs to a different academic year", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const activeYear = await createActiveYear(prisma, school.id);
    const staleYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2025-26",
        startDate: new Date("2025-04-01"),
        endDate: new Date("2026-03-31"),
        status: "archived",
      },
    });
    const staleClass = await createClass(prisma, {
      schoolId: school.id,
      academicYearId: staleYear.id,
      name: "Grade 5",
      section: "A",
    });

    const result = await listFeeStructures(prisma, {
      classId: staleClass.id,
      schoolId: school.id,
      academicYearId: activeYear.id,
    });
    expect(result).toEqual({ ok: false, error: "INVALID_CLASS" });
  });

  it("rejects a missing classId with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15550097777", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/fee-structures");
    const response = await getFeeStructures(request);
    expect(response.status).toBe(400);
  });
});

describe("netAmountDue", () => {
  it("subtracts the discount from the amount due", () => {
    const due = netAmountDue(
      {
        amount: new Prisma.Decimal(5000),
        discount: new Prisma.Decimal(500),
        fineAmount: new Prisma.Decimal(0),
        dueDate: new Date("2026-12-01"),
      },
      new Date("2026-06-01")
    );
    expect(due.toNumber()).toBe(4500);
  });

  it("adds the fine once the due date has passed", () => {
    const due = netAmountDue(
      {
        amount: new Prisma.Decimal(5000),
        discount: new Prisma.Decimal(0),
        fineAmount: new Prisma.Decimal(200),
        dueDate: new Date("2026-01-01"),
      },
      new Date("2026-06-01")
    );
    expect(due.toNumber()).toBe(5200);
  });

  it("does not add the fine before the due date", () => {
    const due = netAmountDue(
      {
        amount: new Prisma.Decimal(5000),
        discount: new Prisma.Decimal(0),
        fineAmount: new Prisma.Decimal(200),
        dueDate: new Date("2026-12-01"),
      },
      new Date("2026-06-01")
    );
    expect(due.toNumber()).toBe(5000);
  });

  it("lets a payment cover the fine without triggering EXCEEDS_AMOUNT_DUE", async () => {
    await resetDb();
    const school = await prisma.school.create({ data: { name: "Fine Test School" } });
    const year = await createActiveYear(prisma, school.id);
    const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 5", section: "A" });
    const student = await createEnrolledStudent(prisma, {
      schoolId: school.id,
      classId: klass.id,
      academicYearId: year.id,
      name: "Fine Student",
      dob: new Date("2016-01-01"),
      admissionNo: "SCH-960",
    });
    const accountant = await prisma.user.create({
      data: { phone: "+15550101010", role: "accountant", name: "Fine Accountant", schoolId: school.id },
    });
    // a fee structure of 5000 with a 200 fine, past its due date
    const feeStructure = await prisma.feeStructure.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        classId: klass.id,
        term: "Term 1",
        amount: 5000,
        fineAmount: 200,
        dueDate: new Date("2020-01-01"),
      },
    });

    const result = await recordPayment(prisma, {
      feeStructureId: feeStructure.id,
      studentId: student.id,
      schoolId: school.id,
      recordedById: accountant.id,
      amount: 5200,
      mode: "cash",
    });
    expect(result).toMatchObject({ ok: true, status: "paid" });
  });
});
