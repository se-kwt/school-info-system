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
import { GET as getGrades, POST as postGrades } from "../src/app/api/grades/route";

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

  it("does not lose a grade's sortOrder when two POSTs race in the same school", async () => {
    // Regression guard for the auto-assigned sortOrder race: `createGrade`
    // computes sortOrder as (max existing sortOrder) + 1 inside a
    // Serializable transaction, and this route retries once on Prisma's
    // P2034 serialization-failure code (see createGradeWithRetry in
    // src/app/api/grades/route.ts). Without that, two concurrent creates
    // with no explicit sortOrder can both read the same max and only one
    // would survive the unique constraint. Firing two concurrent POSTs (no
    // sortOrder given, so both go through the auto-assign/retry path) and
    // asserting both succeed with distinct sortOrders is evidence the retry
    // path actually works, not just that the unique constraint blocks
    // corruption.
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    function createNamedGrade(name: string) {
      const request = new Request("http://localhost/api/grades", {
        method: "POST",
        body: JSON.stringify({ name }),
        headers: { "content-type": "application/json" },
      });
      return postGrades(request);
    }

    const [r1, r2] = await Promise.all([createNamedGrade("Grade A"), createNamedGrade("Grade B")]);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const grades = await prisma.grade.findMany({ where: { schoolId: school.id } });
    expect(grades).toHaveLength(2);
    expect(new Set(grades.map((g) => g.sortOrder)).size).toBe(2);
  });
});
