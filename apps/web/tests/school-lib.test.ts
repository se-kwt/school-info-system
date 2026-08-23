import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { updateSchoolProfile } from "../src/lib/school-setup/school";

describe("school.ts profile fields", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("stores and reads back address, phone, email, and principalName", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });

    const result = await updateSchoolProfile(prisma, school.id, {
      address: "12 Example Road, Kochi",
      phone: "+919876543210",
      email: "office@testschool.example",
      principalName: "Dr. A. Principal",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.school).toMatchObject({
      address: "12 Example Road, Kochi",
      phone: "+919876543210",
      email: "office@testschool.example",
      principalName: "Dr. A. Principal",
    });

    const stored = await prisma.school.findUniqueOrThrow({ where: { id: school.id } });
    expect(stored.address).toBe("12 Example Road, Kochi");
    expect(stored.phone).toBe("+919876543210");
    expect(stored.email).toBe("office@testschool.example");
    expect(stored.principalName).toBe("Dr. A. Principal");
  });

  it("returns NOT_FOUND for a nonexistent school", async () => {
    const result = await updateSchoolProfile(prisma, 999999, { address: "Nowhere" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
