import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";

export async function GET() {
  try {
    const claims = requireApiRole(["parent"]);

    const notifications = await prisma.notification.findMany({
      where: { userId: claims.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: claims.userId, readAt: null },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
