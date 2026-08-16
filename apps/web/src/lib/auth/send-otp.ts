import type { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { generateOtpCode, hashOtpCode } from "./otp";
import type { SmsSender } from "./sms-sender";

const OTP_TTL_MINUTES = 5;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_REQUESTS = 3;

export type SendOtpResult = { success: true; code?: string } | { success: false; error: "RATE_LIMITED" };

export async function sendOtp(
  phone: string,
  deps: { prisma: PrismaClient; smsSender: SmsSender; exposeCodeForTesting?: boolean }
): Promise<SendOtpResult> {
  const user = await deps.prisma.user.findUnique({ where: { phone } });
  const isUsable = !!user && user.status !== "inactive";

  // Rate-limit uniformly regardless of registration status -- otherwise the
  // point at which a phone starts getting 429s reveals whether it's a real
  // account, reopening the exact enumeration channel closed elsewhere.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const recentCount = await deps.prisma.otpCode.count({
    where: { phone, createdAt: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return { success: false, error: "RATE_LIMITED" };
  }

  if (!isUsable) {
    // Do not reveal whether this phone is registered -- create an OtpCode
    // row so the rate-limit counting/behavior is identical to a real send,
    // but with a random, permanently-invalid hash/salt (nobody can ever
    // "know" this code) and without sending an SMS.
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await deps.prisma.otpCode.create({
      data: {
        phone,
        codeHash: crypto.randomBytes(32).toString("hex"),
        salt: crypto.randomBytes(16).toString("hex"),
        expiresAt,
      },
    });
    return { success: true };
  }

  const code = generateOtpCode();
  const { hash, salt } = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await deps.prisma.otpCode.create({
    data: { phone, codeHash: hash, salt, expiresAt },
  });

  await deps.smsSender.send(phone, `Your School IS verification code is ${code}`);

  return deps.exposeCodeForTesting ? { success: true, code } : { success: true };
}
