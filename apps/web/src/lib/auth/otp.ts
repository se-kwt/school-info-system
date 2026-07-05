import { randomInt, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(code, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyOtpCode(code: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(code, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
