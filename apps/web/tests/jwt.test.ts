import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "../src/lib/auth/jwt";

describe("session jwt", () => {
  it("round-trips claims through sign and verify", () => {
    const token = signSessionToken({ userId: 42, role: "parent", schoolId: 1 });
    const claims = verifySessionToken(token);

    expect(claims.userId).toBe(42);
    expect(claims.role).toBe("parent");
    expect(claims.schoolId).toBe(1);
  });

  it("throws for a tampered token", () => {
    const token = signSessionToken({ userId: 42, role: "parent", schoolId: 1 });
    const tampered = token.slice(0, -2) + "xx";
    expect(() => verifySessionToken(tampered)).toThrow();
  });
});
