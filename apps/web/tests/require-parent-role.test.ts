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
import { requireParentRole } from "../src/lib/auth/require-parent-role";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireParentRole", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    redirectMock.mockClear();
  });

  it("returns claims when the session cookie has the parent role", () => {
    const token = signSessionToken({ userId: 1, role: "parent", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = requireParentRole();

    expect(claims.role).toBe("parent");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session cookie", () => {
    cookieStore.get.mockReturnValue(undefined);

    expect(() => requireParentRole()).toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login for a valid session with a staff role", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    expect(() => requireParentRole()).toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
