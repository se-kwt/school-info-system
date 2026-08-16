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
import { requireDashboardRole } from "../src/lib/auth/require-dashboard-role";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireDashboardRole", () => {
  beforeEach(async () => {
    cookieStore.get.mockReset();
    redirectMock.mockClear();
    await resetDb();
  });

  it("returns claims when the session cookie has an allowed role", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550003333", name: "An Admin", role: "admin", status: "active" },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = await requireDashboardRole(["admin", "accountant"]);

    expect(claims.role).toBe("admin");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);

    await expect(requireDashboardRole(["admin"])).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /dashboard when the role is not allowed for this page", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550004444", name: "A Teacher", role: "teacher", status: "active" },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    await expect(requireDashboardRole(["admin", "accountant"])).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard"
    );
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /login (not /dashboard) for a valid session with a non-staff role, to avoid a redirect loop", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const parent = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550005555", name: "A Parent", role: "parent", status: "active" },
    });
    const token = signSessionToken({ userId: parent.id, role: "parent", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    await expect(requireDashboardRole(["teacher", "admin", "accountant"])).rejects.toThrow(
      "NEXT_REDIRECT:/login"
    );
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the DB user's status is inactive, even with a valid session", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550007777", name: "An Admin", role: "admin", status: "active" },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId: school.id });

    await prisma.user.update({ where: { id: admin.id }, data: { status: "inactive" } });

    cookieStore.get.mockReturnValue({ value: token });

    await expect(requireDashboardRole(["admin"])).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
