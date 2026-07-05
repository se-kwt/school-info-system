import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import { AuthError } from "./rbac";
import type { SessionClaims } from "./jwt";

export function requireApiRole(allowedRoles: SessionClaims["role"][]): SessionClaims {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims) {
    throw new AuthError(401, "Not authenticated");
  }

  if (!allowedRoles.includes(claims.role)) {
    throw new AuthError(403, "Role not permitted for this resource");
  }

  return claims;
}
