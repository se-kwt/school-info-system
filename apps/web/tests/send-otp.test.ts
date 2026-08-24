import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { sendOtp } from "../src/lib/auth/send-otp";
import { POST as sendOtpRoute } from "../src/app/api/auth/send-otp/route";
import type { SmsSender } from "../src/lib/auth/sms-sender";

class FakeSmsSender implements SmsSender {
  public sentMessages: { phone: string; message: string }[] = [];
  async send(phone: string, message: string): Promise<void> {
    this.sentMessages.push({ phone, message });
  }
}

// A minimal no-op SmsSender for tests that don't care about the sent message,
// only about whether sendOtp's result shape exposes the plaintext code.
class NoopSmsSender implements SmsSender {
  async send(): Promise<void> {
    // intentionally does nothing
  }
}

describe("sendOtp", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("stores a hashed OTP and sends it via SMS for a registered phone", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550001111", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    const result = await sendOtp("+15550001111", { prisma, smsSender });

    expect(result.success).toBe(true);
    expect(smsSender.sentMessages).toHaveLength(1);
    expect(smsSender.sentMessages[0].phone).toBe("+15550001111");

    const stored = await prisma.otpCode.findFirst({ where: { phone: "+15550001111" } });
    expect(stored).not.toBeNull();
    expect(stored?.codeHash).not.toBe("");
    if (result.success) {
      expect(result.code).toBeUndefined();
    }
  });

  it("only returns the plaintext code when exposeCodeForTesting is explicitly passed", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550003333", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    const result = await sendOtp("+15550003333", { prisma, smsSender, exposeCodeForTesting: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.code).toMatch(/^\d{6}$/);
      expect(smsSender.sentMessages[0].message).toContain(result.code!);
    }
  });

  it("returns the identical response shape for an unregistered phone as for a registered one", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550002222", name: "Registered", role: "parent" },
    });

    const fakeSmsSender = new FakeSmsSender();

    const registeredResult = await sendOtp("+15550002222", { prisma, smsSender: fakeSmsSender });
    const unregisteredResult = await sendOtp("+15550009999", { prisma, smsSender: fakeSmsSender });

    expect(registeredResult).toEqual({ success: true });
    expect(unregisteredResult).toEqual({ success: true }); // identical shape -- no way to tell them apart
    expect(fakeSmsSender.sentMessages).toHaveLength(1); // only the registered phone actually got an SMS

    // A row is created for rate-limiting purposes, but with a random,
    // permanently-unusable hash/salt -- it can never authenticate anyone.
    const otpRows = await prisma.otpCode.findMany({ where: { phone: "+15550009999" } });
    expect(otpRows).toHaveLength(1);
    expect(otpRows[0].codeHash).not.toBe("");
  });

  it("treats a deactivated user's phone the same as an unregistered one — returns success without sending SMS, but still records a rate-limit row", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: {
        phone: "+15550002222",
        role: "teacher",
        name: "Deactivated Teacher",
        schoolId: school.id,
        status: "inactive",
      },
    });

    const smsSender = new FakeSmsSender();
    const result = await sendOtp("+15550002222", { prisma, smsSender });

    expect(result).toEqual({ success: true });
    expect(smsSender.sentMessages).toHaveLength(0); // no SMS sent

    const otpRows = await prisma.otpCode.findMany({ where: { phone: "+15550002222" } });
    expect(otpRows).toHaveLength(1); // rate-limit row recorded, matching registered-phone behavior
  });

  it("rejects a 4th OTP request for the same UNREGISTERED phone within 10 minutes, matching registered-phone behavior", async () => {
    const fakeSmsSender = new FakeSmsSender();

    for (let i = 0; i < 3; i++) {
      const result = await sendOtp("+15550009191", { prisma, smsSender: fakeSmsSender });
      expect(result).toEqual({ success: true });
    }

    const fourth = await sendOtp("+15550009191", { prisma, smsSender: fakeSmsSender });
    expect(fourth).toEqual({ success: false, error: "RATE_LIMITED" });
    expect(fakeSmsSender.sentMessages).toHaveLength(0); // never a real registered account, no SMS ever sent
  });

  it("rejects a 4th OTP request for the same phone within 10 minutes", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { schoolId: school.id, phone: "+15550003333", name: "Test User", role: "parent" },
    });
    const fakeSmsSender = new FakeSmsSender();

    for (let i = 0; i < 3; i++) {
      const result = await sendOtp("+15550003333", { prisma, smsSender: fakeSmsSender });
      expect(result).toEqual({ success: true });
    }

    const fourth = await sendOtp("+15550003333", { prisma, smsSender: fakeSmsSender });
    expect(fourth).toEqual({ success: false, error: "RATE_LIMITED" });
    expect(fakeSmsSender.sentMessages).toHaveLength(3); // the 4th never sent
  });

  it("returns a clean 400 JSON error for a malformed request body instead of throwing", async () => {
    const request = new Request("http://localhost/api/auth/send-otp", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    const response = await sendOtpRoute(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid request body" });
  });

  // Regression test for a mis-filed audit finding: the finding claimed the
  // test-OTP affordance was an exploitable vulnerability, but sendOtp already
  // gates the plaintext code behind an explicit exposeCodeForTesting flag
  // (and the route only ever passes that flag when EXPOSE_OTP_FOR_TESTING ===
  // "true"). These tests pin that behavior down at the sendOtp level so the
  // gate can't silently regress.
  it("does not return the code unless explicitly asked to expose it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+919876543210", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const result = await sendOtp("+919876543210", {
      prisma,
      smsSender: new NoopSmsSender(),
    });

    expect(result).toEqual({ success: true });
    expect("code" in result).toBe(false);
  });

  it("returns the code only when exposeCodeForTesting is true", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+919876543211", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const result = await sendOtp("+919876543211", {
      prisma,
      smsSender: new NoopSmsSender(),
      exposeCodeForTesting: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(typeof result.code).toBe("string");
  });

  describe("EXPOSE_OTP_FOR_TESTING gating", () => {
    const originalValue = process.env.EXPOSE_OTP_FOR_TESTING;

    afterEach(() => {
      if (originalValue === undefined) {
        delete process.env.EXPOSE_OTP_FOR_TESTING;
      } else {
        process.env.EXPOSE_OTP_FOR_TESTING = originalValue;
      }
    });

    it("omits the code from the response when EXPOSE_OTP_FOR_TESTING is unset", async () => {
      delete process.env.EXPOSE_OTP_FOR_TESTING;
      const school = await prisma.school.create({ data: { name: "Test School" } });
      await prisma.user.create({
        data: { phone: "+15550004444", role: "parent", name: "Test Parent", schoolId: school.id },
      });

      const request = new Request("http://localhost/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone: "+15550004444" }),
        headers: { "content-type": "application/json" },
      });

      const response = await sendOtpRoute(request);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.code).toBeUndefined();
    });

    it("includes the code in the response when EXPOSE_OTP_FOR_TESTING is 'true'", async () => {
      process.env.EXPOSE_OTP_FOR_TESTING = "true";
      const school = await prisma.school.create({ data: { name: "Test School" } });
      await prisma.user.create({
        data: { phone: "+15550005555", role: "parent", name: "Test Parent", schoolId: school.id },
      });

      const request = new Request("http://localhost/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone: "+15550005555" }),
        headers: { "content-type": "application/json" },
      });

      const response = await sendOtpRoute(request);
      const body = await response.json();

      expect(body.code).toMatch(/^\d{6}$/);
    });
  });
});
