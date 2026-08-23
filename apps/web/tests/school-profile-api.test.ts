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
import { updateSchoolProfile } from "../src/lib/school-setup/school";
import { PATCH as patchSchool } from "../src/app/api/school/route";

describe("school profile", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  function loginAs(userId: number, role: "admin" | "teacher" | "accountant", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("updates the school profile", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const schoolId = school.id;

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

    const updated = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    expect(updated.name).toBe("Renamed School");
    expect(updated.principalName).toBe("Dr. Example");
  });

  it("rejects an empty name", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const schoolId = school.id;

    const result = await updateSchoolProfile(prisma, { schoolId, fields: { name: "   " } });

    expect(result).toEqual({ ok: false, error: "INVALID_NAME" });
    const updated = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    expect(updated.name).not.toBe("   ");
  });

  it("returns NOT_FOUND for a nonexistent school", async () => {
    const result = await updateSchoolProfile(prisma, { schoolId: 999999, fields: { address: "Nowhere" } });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("clears address, phone, email and principalName when sent as empty strings", async () => {
    const school = await prisma.school.create({
      data: {
        name: "Test School",
        address: "1 School Road",
        phone: "+914842223333",
        email: "office@school.test",
        principalName: "Dr. Example",
      },
    });

    const result = await updateSchoolProfile(prisma, {
      schoolId: school.id,
      fields: { address: "", phone: "", email: "", principalName: "" },
    });

    expect(result).toEqual({ ok: true });
    const updated = await prisma.school.findUniqueOrThrow({ where: { id: school.id } });
    expect(updated.address).toBeNull();
    expect(updated.phone).toBeNull();
    expect(updated.email).toBeNull();
    expect(updated.principalName).toBeNull();
  });

  it("PATCH /api/school rejects a non-admin", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15550031111", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/school", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed School" }),
      headers: { "content-type": "application/json" },
    });
    const response = await patchSchool(request);

    expect(response.status).toBe(403);
  });
});
