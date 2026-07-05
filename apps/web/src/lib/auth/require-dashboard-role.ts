import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import type { SessionClaims } from "./jwt";

export function requireDashboardRole(allowedRoles: SessionClaims["role"][]): SessionClaims {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims) {
    redirect("/login");
  }

  if (!allowedRoles.includes(claims.role)) {
    redirect("/dashboard");
  }

  return claims;
}
