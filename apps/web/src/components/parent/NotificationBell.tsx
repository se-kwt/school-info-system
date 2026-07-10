"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-all hover:bg-neutral-100"
      >
        <Bell className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-10 w-40 rounded-lg border border-neutral-200 bg-white p-2 text-[11px] font-medium text-neutral-600 shadow-md">
          Notifications are coming soon.
        </div>
      )}
    </div>
  );
}
