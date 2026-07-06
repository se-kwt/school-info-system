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
import { requireDashboardRole } from "../src/lib/auth/require-dashboard-role";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireDashboardRole", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    redirectMock.mockClear();
  });

  it("returns claims when the session cookie has an allowed role", () => {
    const token = signSessionToken({ userId: 1, role: "admin", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = requireDashboardRole(["admin", "accountant"]);

    expect(claims.role).toBe("admin");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session cookie", () => {
    cookieStore.get.mockReturnValue(undefined);

    expect(() => requireDashboardRole(["admin"])).toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /dashboard when the role is not allowed for this page", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    expect(() => requireDashboardRole(["admin", "accountant"])).toThrow("NEXT_REDIRECT:/dashboard");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /login (not /dashboard) for a valid session with a non-staff role, to avoid a redirect loop", () => {
    const token = signSessionToken({ userId: 1, role: "parent", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    expect(() => requireDashboardRole(["teacher", "admin", "accountant"])).toThrow(
      "NEXT_REDIRECT:/login"
    );
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
