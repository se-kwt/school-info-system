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
import { GET as getGrades } from "../src/app/api/grades/route";

describe("/api/grades", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15551230000", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("scopes classCount to the requested academic year", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 1" } });
    const yearA = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2025-26", startDate: new Date("2025-06-01"), endDate: new Date("2026-04-30"), status: "archived" },
    });
    const yearB = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-27", startDate: new Date("2026-06-01"), endDate: new Date("2027-04-30"), status: "active" },
    });
    await prisma.class.create({ data: { schoolId: school.id, section: "A", gradeId: grade.id, academicYearId: yearA.id } });
    await prisma.class.create({ data: { schoolId: school.id, section: "A", gradeId: grade.id, academicYearId: yearB.id } });

    const allTimeResponse = await getGrades(new Request("http://localhost/api/grades"));
    const allTime = await allTimeResponse.json();
    expect(allTime[0].classCount).toBe(2);

    const scopedResponse = await getGrades(new Request(`http://localhost/api/grades?academicYearId=${yearB.id}`));
    const scoped = await scopedResponse.json();
    expect(scoped[0].classCount).toBe(1);
  });

  it("rejects an unauthenticated request with 401", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const response = await getGrades(new Request("http://localhost/api/grades"));
    expect(response.status).toBe(401);
  });
});
