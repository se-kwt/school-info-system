import type { PrismaClient } from "@prisma/client";
import { generateOtpCode, hashOtpCode } from "./otp";
import type { SmsSender } from "./sms-sender";

const OTP_TTL_MINUTES = 5;

export async function sendOtp(
  phone: string,
  deps: { prisma: PrismaClient; smsSender: SmsSender; exposeCodeForTesting?: boolean }
): Promise<{ success: true; code?: string }> {
  const user = await deps.prisma.user.findUnique({ where: { phone } });
  if (!user || user.status === "inactive") {
    throw new Error("PHONE_NOT_REGISTERED");
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
