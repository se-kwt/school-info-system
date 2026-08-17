import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { requireApiRole } from "../src/lib/auth/require-api-role";
import { signSessionToken } from "../src/lib/auth/jwt";
import { AuthError } from "../src/lib/auth/rbac";

describe("requireApiRole", () => {
  beforeEach(async () => {
    cookieStore.get.mockReset();
    await resetDb();
  });

  it("returns claims when the session cookie has an allowed role", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550001111", name: "An Admin", role: "admin", status: "active" },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = await requireApiRole(["admin"]);

    expect(claims.role).toBe("admin");
  });

  it("throws a 401 AuthError when there is no session cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);

    const result = requireApiRole(["admin"]);
    await expect(result).rejects.toBeInstanceOf(AuthError);
    await expect(result).rejects.toMatchObject({ status: 401 });
  });

  it("throws a 403 AuthError when the role is not allowed", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550002222", name: "A Teacher", role: "teacher", status: "active" },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const result = requireApiRole(["admin"]);
    await expect(result).rejects.toBeInstanceOf(AuthError);
    await expect(result).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a request from a user whose status is inactive, even with a valid session", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550006666", name: "A Teacher", role: "teacher", status: "active" },
    });

    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });

    await prisma.user.update({ where: { id: teacher.id }, data: { status: "inactive" } });

    cookieStore.get.mockReturnValue({ value: token });

    const result = requireApiRole(["teacher", "admin"]);
    await expect(result).rejects.toBeInstanceOf(AuthError);
    await expect(result).rejects.toMatchObject({ status: 401 });
  });

  it("throws a 401 AuthError when the DB user no longer exists", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const token = signSessionToken({ userId: 999999, role: "admin", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const result = requireApiRole(["admin"]);
    await expect(result).rejects.toBeInstanceOf(AuthError);
    await expect(result).rejects.toMatchObject({ status: 401 });
  });
});
