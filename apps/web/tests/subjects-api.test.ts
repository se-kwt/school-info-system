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
import { POST as postSubjects } from "../src/app/api/grades/[id]/subjects/route";

describe("/api/grades/[id]/subjects", () => {
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
      data: { phone: "+15559990000", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("forwards code, creditHours, weeklyPeriods, isPractical, and isElective through to the created subject", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 9" } });

    const request = new Request(`http://localhost/api/grades/${grade.id}/subjects`, {
      method: "POST",
      body: JSON.stringify({
        name: "Physics Lab",
        code: "PHY-LAB",
        creditHours: 2.5,
        weeklyPeriods: 3,
        isPractical: true,
        isElective: true,
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await postSubjects(request, { params: Promise.resolve({ id: String(grade.id) }) });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({
      code: "PHY-LAB",
      creditHours: 2.5,
      weeklyPeriods: 3,
      isPractical: true,
      isElective: true,
    });

    const stored = await prisma.subject.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.code).toBe("PHY-LAB");
    expect(stored.creditHours).toBe(2.5);
    expect(stored.weeklyPeriods).toBe(3);
    expect(stored.isPractical).toBe(true);
    expect(stored.isElective).toBe(true);
  });
});
