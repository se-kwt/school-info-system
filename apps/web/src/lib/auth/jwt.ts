import jwt from "jsonwebtoken";

export interface SessionClaims {
  userId: number;
  role: "parent" | "teacher" | "admin" | "accountant";
  schoolId: number;
}

const SESSION_TTL = "30d";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): SessionClaims {
  return jwt.verify(token, getSecret()) as SessionClaims;
}
