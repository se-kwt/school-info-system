import type { PrismaClient } from "@prisma/client";
import { verifyOtpCode } from "./otp";
import { signSessionToken, type SessionClaims } from "./jwt";

export type VerifyOtpResult =
  | { ok: true; token: string; role: SessionClaims["role"] }
  | { ok: false; error: "INVALID_CODE" | "EXPIRED" | "NOT_FOUND" };

export async function verifyOtp(
  phone: string,
  code: string,
  deps: { prisma: PrismaClient }
): Promise<VerifyOtpResult> {
  const otpRecord = await deps.prisma.otpCode.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (otpRecord.expiresAt < new Date()) {
    return { ok: false, error: "EXPIRED" };
  }

  const isValid = verifyOtpCode(code, otpRecord.codeHash, otpRecord.salt);
  if (!isValid) {
    await deps.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "INVALID_CODE" };
  }

  await deps.prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { usedAt: new Date() },
  });

  const user = await deps.prisma.user.findUniqueOrThrow({ where: { phone } });
  if (user.status === "inactive") {
    return { ok: false, error: "NOT_FOUND" };
  }

  const token = signSessionToken({
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });

  return { ok: true, token, role: user.role };
}
