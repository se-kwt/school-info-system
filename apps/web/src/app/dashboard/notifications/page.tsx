import Link from "next/link";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { prisma } from "@/lib/prisma";
import { getUserNotifications, notificationHref } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/format";

export default async function NotificationsPage() {
  const claims = await requireDashboardRole(["teacher", "admin", "accountant"]);

  // Same query the notification bell dropdown uses (see src/lib/notifications.ts),
  // just without the dropdown's take:20 cap -- this is the full list.
  const notifications = await getUserNotifications(prisma, claims.userId);

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <h1 className="mb-4 text-sm font-bold text-neutral-800">Notifications</h1>
      {notifications.length === 0 ? (
        <p className="text-xs text-neutral-400">No notifications yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Link
                href={notificationHref(notification)}
                className={`block px-1 py-3 text-xs hover:bg-neutral-50 ${
                  notification.readAt ? "text-neutral-500" : "font-semibold text-neutral-800"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p>{notification.title}</p>
                  <span className="shrink-0 text-[11px] font-normal text-neutral-400">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-normal text-neutral-400">{notification.body}</p>
                {!notification.readAt && (
                  <span className="mt-1 inline-block rounded-full bg-[#14B8A6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#14B8A6]">
                    Unread
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
