import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import type { SessionClaims } from "./jwt";

const STAFF_ROLES: SessionClaims["role"][] = ["teacher", "admin", "accountant"];

export async function requireDashboardRole(allowedRoles: SessionClaims["role"][]): Promise<SessionClaims> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
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

  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { status: true } });
  if (!user || user.status !== "active") {
    redirect("/login");
  }

  return claims;
}
