import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import type { SessionClaims } from "./jwt";

const STAFF_ROLES: SessionClaims["role"][] = ["teacher", "admin", "accountant"];

export function requireDashboardRole(allowedRoles: SessionClaims["role"][]): SessionClaims {
  const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  // A session with no staff role at all (e.g. "parent") can never reach any
  // /dashboard/* page, including /dashboard itself -- redirecting such a
  // session to /dashboard would loop forever through this same check.
  if (!claims || !STAFF_ROLES.includes(claims.role)) {
    redirect("/login");
  }

  if (!allowedRoles.includes(claims.role)) {
    redirect("/dashboard");
  }

  return claims;
}
