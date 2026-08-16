import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { sendOtp } from "../src/lib/auth/send-otp";
import { POST as sessionRoute } from "../src/app/api/auth/session/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session-cookie";
import type { SmsSender } from "../src/lib/auth/sms-sender";

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

describe("POST /api/auth/session", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("sets an HttpOnly session cookie for a correct, unexpired code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550006666", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550006666", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ phone: "+15550006666", code }),
      headers: { "content-type": "application/json" },
    });

    const response = await sessionRoute(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("includes the user's role in the response body", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550006667", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550006667", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ phone: "+15550006667", code }),
      headers: { "content-type": "application/json" },
    });

    const response = await sessionRoute(request);
    const body = await response.json();

    expect(body).toEqual({ success: true, role: "parent" });
  });

  it("returns 401 with no cookie for an incorrect code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550007777", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550007777", { prisma, smsSender });

    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ phone: "+15550007777", code: "000000" }),
      headers: { "content-type": "application/json" },
    });

    const response = await sessionRoute(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 429 with a clear message after too many incorrect attempts", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550008888", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550008888", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    for (let i = 0; i < 5; i++) {
      const request = new Request("http://localhost/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ phone: "+15550008888", code: "000000" }),
        headers: { "content-type": "application/json" },
      });
      const response = await sessionRoute(request);
      expect(response.status).toBe(401);
    }

    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ phone: "+15550008888", code }),
      headers: { "content-type": "application/json" },
    });
    const response = await sessionRoute(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: "Too many incorrect attempts. Request a new code." });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 for a malformed request body", async () => {
    const request = new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    const response = await sessionRoute(request);
    expect(response.status).toBe(400);
  });
});
