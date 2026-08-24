import type { PrismaClient } from "@prisma/client";

export interface NotificationLike {
  type: string;
  relatedId: number | null;
}

/**
 * The query behind both the notification bell dropdown and the full
 * notifications page. Keeping it in one place means the two surfaces can
 * never drift into two different notions of "a user's notifications".
 */
export function getUserNotifications(
  prisma: PrismaClient,
  userId: number,
  options?: { take?: number }
) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    ...(options?.take !== undefined ? { take: options.take } : {}),
  });
}

export function getUnreadNotificationCount(prisma: PrismaClient, userId: number) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export function notificationHref(notification: NotificationLike): string {
  switch (notification.type) {
    case "assignment_published":
      return notification.relatedId
        ? `/parent/assignments/${notification.relatedId}`
        : "/parent/assignments";
    default:
      return "/parent";
  }
}
