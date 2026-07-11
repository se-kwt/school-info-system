"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function ProfileMenu({ initials }: { initials: string }) {
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

  const menuItemClass = "block px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Profile menu"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6] text-xs font-bold text-white"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-10 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-md">
          <Link href="/parent/profile" className={menuItemClass} onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link href="/parent/settings" className={menuItemClass} onClick={() => setOpen(false)}>
            Settings
          </Link>
          <hr className="my-1 border-neutral-200" />
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className={`w-full text-left ${menuItemClass}`}>
              Logout
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
