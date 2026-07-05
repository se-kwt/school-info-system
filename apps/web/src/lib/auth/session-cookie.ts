import { verifySessionToken, type SessionClaims } from "./jwt";

export const SESSION_COOKIE_NAME = "session";

export function verifySessionCookie(cookieValue: string | undefined): SessionClaims | null {
  if (!cookieValue) return null;
  try {
    return verifySessionToken(cookieValue);
  } catch {
    return null;
  }
}
