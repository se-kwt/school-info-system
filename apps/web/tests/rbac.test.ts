import { describe, it, expect } from "vitest";
import { requireRole, AuthError } from "../src/lib/auth/rbac";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireRole", () => {
  it("returns claims for a valid token with an allowed role", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    const claims = requireRole(`Bearer ${token}`, ["teacher", "admin"]);
    expect(claims.userId).toBe(1);
    expect(claims.role).toBe("teacher");
  });

  it("throws a 403 AuthError for a valid token with a disallowed role", () => {
    const token = signSessionToken({ userId: 1, role: "parent", schoolId: 1 });
    try {
      requireRole(`Bearer ${token}`, ["teacher", "admin"]);
      throw new Error("expected requireRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(403);
    }
  });

  it("throws a 401 AuthError for a missing Authorization header", () => {
    try {
      requireRole(null, ["teacher"]);
      throw new Error("expected requireRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
    }
  });

  it("throws a 401 AuthError for an invalid token", () => {
    try {
      requireRole("Bearer not-a-real-token", ["teacher"]);
      throw new Error("expected requireRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
    }
  });
});
