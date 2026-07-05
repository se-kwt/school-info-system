import { describe, it, expect } from "vitest";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "../src/lib/auth/otp";

describe("otp", () => {
  it("generates a 6-digit numeric code", () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifies a correctly hashed code", () => {
    const code = "123456";
    const { hash, salt } = hashOtpCode(code);
    expect(verifyOtpCode(code, hash, salt)).toBe(true);
  });

  it("rejects an incorrect code", () => {
    const { hash, salt } = hashOtpCode("123456");
    expect(verifyOtpCode("999999", hash, salt)).toBe(false);
  });
});
