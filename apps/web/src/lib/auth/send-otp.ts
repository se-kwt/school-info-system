import type { PrismaClient } from "@prisma/client";
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
  if (!user || user.status === "inactive") {
    // Do not reveal whether this phone is registered -- return the same shape
    // as a real send, having done nothing.
    return { success: true };
  }

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const recentCount = await deps.prisma.otpCode.count({
    where: { phone, createdAt: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return { success: false, error: "RATE_LIMITED" };
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
