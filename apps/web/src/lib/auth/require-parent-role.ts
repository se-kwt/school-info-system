import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session-cookie";
import type { SessionClaims } from "./jwt";

export async function requireParentRole(): Promise<SessionClaims> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claims = verifySessionCookie(cookieValue);

  if (!claims || claims.role !== "parent") {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { status: true } });
  if (!user || user.status !== "active") {
    redirect("/login");
  }

  return claims;
}
