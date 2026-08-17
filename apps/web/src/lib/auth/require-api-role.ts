import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import { AuthError } from "./rbac";
import type { SessionClaims } from "./jwt";

export async function requireApiRole(allowedRoles: SessionClaims["role"][]): Promise<SessionClaims> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims) {
    throw new AuthError(401, "Not authenticated");
  }

  if (!allowedRoles.includes(claims.role)) {
    throw new AuthError(403, "Role not permitted for this resource");
  }

  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { status: true } });
  if (!user || user.status !== "active") {
    throw new AuthError(401, "Account is no longer active");
  }

  return claims;
}
