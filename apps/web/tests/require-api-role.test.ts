import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach } from "vitest";
import { requireApiRole } from "../src/lib/auth/require-api-role";
import { AuthError } from "../src/lib/auth/rbac";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireApiRole", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
  });

  it("returns claims when the session cookie has an allowed role", () => {
    const token = signSessionToken({ userId: 1, role: "admin", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    const claims = requireApiRole(["admin"]);

    expect(claims.role).toBe("admin");
  });

  it("throws a 401 AuthError when there is no session cookie", () => {
    cookieStore.get.mockReturnValue(undefined);

    try {
      requireApiRole(["admin"]);
      throw new Error("expected requireApiRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
    }
  });

  it("throws a 403 AuthError when the role is not allowed", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    cookieStore.get.mockReturnValue({ value: token });

    try {
      requireApiRole(["admin"]);
      throw new Error("expected requireApiRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(403);
    }
  });
});
