import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getUserNotifications, getUnreadNotificationCount } from "@/lib/notifications";

export async function GET() {
  try {
    const claims = await requireApiRole(["parent"]);

    const notifications = await getUserNotifications(prisma, claims.userId, { take: 20 });
    const unreadCount = await getUnreadNotificationCount(prisma, claims.userId);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
