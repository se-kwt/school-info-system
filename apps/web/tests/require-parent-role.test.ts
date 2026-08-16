import { vi } from "vitest";

const { cookieStore, redirectMock } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
  redirectMock: vi.fn((path: string) => {
    const error = new Error(`NEXT_REDIRECT:${path}`);
    throw error;
  }),
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { requireParentRole } from "../src/lib/auth/require-parent-role";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireParentRole", () => {
  beforeEach(async () => {
    cookieStore.get.mockReset();
    redirectMock.mockClear();
    await resetDb();
  });

  it("returns claims when the session cookie has the parent role", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const parent = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550008888", name: "A Parent", role: "parent", status: "active" },
    });
    const token = signSessionToken({ userId: parent.id, role: "parent", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = await requireParentRole();

    expect(claims.role).toBe("parent");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);

    await expect(requireParentRole()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login for a valid session with a staff role", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550009999", name: "A Teacher", role: "teacher", status: "active" },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    await expect(requireParentRole()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the DB user's status is inactive, even with a valid session", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const parent = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550010000", name: "A Parent", role: "parent", status: "active" },
    });
    const token = signSessionToken({ userId: parent.id, role: "parent", schoolId: school.id });

    await prisma.user.update({ where: { id: parent.id }, data: { status: "inactive" } });

    cookieStore.get.mockReturnValue({ value: token });

    await expect(requireParentRole()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
