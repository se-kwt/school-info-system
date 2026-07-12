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
    expect(result.code).toBeUndefined();
  });

  it("only returns the plaintext code when exposeCodeForTesting is explicitly passed", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550003333", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    const result = await sendOtp("+15550003333", { prisma, smsSender, exposeCodeForTesting: true });

    expect(result.code).toMatch(/^\d{6}$/);
    expect(smsSender.sentMessages[0].message).toContain(result.code!);
  });

  it("rejects an unregistered phone number", async () => {
    const smsSender = new FakeSmsSender();
    await expect(sendOtp("+15559999999", { prisma, smsSender })).rejects.toThrow(
      "PHONE_NOT_REGISTERED"
    );
  });

  it("rejects a deactivated user's phone exactly like an unregistered one", async () => {
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
    await expect(sendOtp("+15550002222", { prisma, smsSender })).rejects.toThrow(
      "PHONE_NOT_REGISTERED"
    );
    expect(smsSender.sentMessages).toHaveLength(0);
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
