import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { sendOtp } from "../src/lib/auth/send-otp";
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
  });

  it("rejects an unregistered phone number", async () => {
    const smsSender = new FakeSmsSender();
    await expect(sendOtp("+15559999999", { prisma, smsSender })).rejects.toThrow(
      "PHONE_NOT_REGISTERED"
    );
  });
});
