"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { notificationHref } from "@/lib/notifications";

interface NotificationEntry {
  id: number;
  type: string;
  title: string;
  body: string;
  relatedId: number | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadNotifications() {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const body = await response.json();
    setNotifications(body.notifications);
    setUnreadCount(body.unreadCount);
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  async function handleNotificationClick(notification: NotificationEntry) {
    if (!notification.readAt) {
      setNotifications((current) =>
        current.map((entry) =>
          entry.id === notification.id ? { ...entry, readAt: new Date().toISOString() } : entry
        )
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      await fetch(`/api/notifications/${notification.id}/read`, { method: "POST" });
    }
    setOpen(false);
    router.push(notificationHref(notification));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-all hover:bg-neutral-100"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
          >
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-10 w-64 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-md">
          {notifications.length === 0 ? (
            <p className="px-3 py-2 text-[11px] font-medium text-neutral-600">
              No notifications yet
            </p>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleNotificationClick(notification)}
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-neutral-50 ${
                  notification.readAt ? "text-neutral-500" : "font-semibold text-neutral-800"
                }`}
              >
                <p>{notification.title}</p>
                <p className="text-[11px] font-normal text-neutral-400">{notification.body}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
