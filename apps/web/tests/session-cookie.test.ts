import { describe, it, expect } from "vitest";
import { verifySessionCookie } from "../src/lib/auth/session-cookie";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("verifySessionCookie", () => {
  it("returns claims for a valid cookie value", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    const claims = verifySessionCookie(token);
    expect(claims).toEqual(
      expect.objectContaining({ userId: 1, role: "teacher", schoolId: 1 })
    );
  });

  it("returns null for an undefined cookie value", () => {
    expect(verifySessionCookie(undefined)).toBeNull();
  });

  it("returns null for an invalid or tampered token", () => {
    expect(verifySessionCookie("not-a-real-token")).toBeNull();
  });
});
