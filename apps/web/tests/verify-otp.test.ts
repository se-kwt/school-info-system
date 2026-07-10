import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { sendOtp } from "../src/lib/auth/send-otp";
import { verifyOtp } from "../src/lib/auth/verify-otp";
import { verifySessionToken } from "../src/lib/auth/jwt";
import type { SmsSender } from "../src/lib/auth/sms-sender";
import { POST as verifyOtpRoute } from "../src/app/api/auth/verify-otp/route";

class FakeSmsSender implements SmsSender {
  public lastMessage = "";
  async send(_phone: string, message: string): Promise<void> {
    this.lastMessage = message;
  }
}

function extractCode(message: string): string {
  const match = message.match(/\d{6}/);
  if (!match) throw new Error("no code found in message");
  return match[0];
}

describe("verifyOtp", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("issues a session token for a correct, unexpired code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const user = await prisma.user.create({
      data: { phone: "+15550002222", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550002222", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    const result = await verifyOtp("+15550002222", code, { prisma });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const claims = verifySessionToken(result.token);
      expect(claims.userId).toBe(user.id);
      expect(claims.role).toBe("teacher");
      expect(claims.schoolId).toBe(school.id);
    }
  });

  it("returns the user's role alongside the session token", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550002223", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550002223", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    const result = await verifyOtp("+15550002223", code, { prisma });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("parent");
    }
  });

  it("rejects an incorrect code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550003333", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550003333", { prisma, smsSender });

    const result = await verifyOtp("+15550003333", "000000", { prisma });
    expect(result).toEqual({ ok: false, error: "INVALID_CODE" });
  });

  it("rejects an expired code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550004444", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550004444", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    await prisma.otpCode.updateMany({
      where: { phone: "+15550004444" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await verifyOtp("+15550004444", code, { prisma });
    expect(result).toEqual({ ok: false, error: "EXPIRED" });
  });

  it("rejects reuse of an already-verified code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550005555", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550005555", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    await verifyOtp("+15550005555", code, { prisma });
    const secondAttempt = await verifyOtp("+15550005555", code, { prisma });

    expect(secondAttempt).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects verification for a user deactivated after their OTP was issued", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const user = await prisma.user.create({
      data: { phone: "+15550006666", role: "teacher", name: "Soon Deactivated", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550006666", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    await prisma.user.update({ where: { id: user.id }, data: { status: "inactive" } });

    const result = await verifyOtp("+15550006666", code, { prisma });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("returns a clean 400 JSON error for a malformed request body instead of throwing", async () => {
    const request = new Request("http://localhost/api/auth/verify-otp", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    const response = await verifyOtpRoute(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid request body" });
  });
});
