"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Building2,
  Users,
  GraduationCap,
  ClipboardCheck,
  BookOpen,
  Award,
  Calendar,
  Wallet,
  CalendarRange,
  Bell,
  FileBarChart,
  FolderOpen,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IconName } from "@/lib/dashboard/nav-items";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const ICON_MAP: Record<IconName, LucideIcon> = {
  LayoutDashboard,
  Building2,
  Users,
  GraduationCap,
  ClipboardCheck,
  BookOpen,
  Award,
  Calendar,
  Wallet,
  CalendarRange,
  Bell,
  FileBarChart,
  FolderOpen,
  Settings,
};

const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar({
  navItems,
  workspaceItems,
  pinnedClasses,
  userName,
  userInitials,
  userRole,
}: {
  navItems: NavItem[];
  workspaceItems: NavItem[];
  pinnedClasses: { id: number; gradeName: string; section: string }[];
  userName: string;
  userInitials: string;
  userRole: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  const navLinkClass =
    "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition-all hover:bg-[#EAECF0]/30 hover:text-neutral-800";

  return (
    <aside
      className={`flex shrink-0 flex-col justify-between border-r border-neutral-200/70 bg-neutral-50/95 transition-all ${
        collapsed ? "w-16" : "w-[260px]"
      }`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs font-bold text-white">
              SI
            </div>
            {!collapsed && (
              <div>
                <p className="text-sm font-semibold tracking-tight text-neutral-900">School Info System</p>
                <p className="text-[10px] font-medium text-neutral-400">School Workspace</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-1">
        <div>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Main Menu
            </p>
          )}
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = ICON_MAP[item.icon];
              return (
                <li key={item.href}>
                  <Link href={item.href} className={navLinkClass} title={collapsed ? item.label : undefined}>
                    <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Workspace
            </p>
          )}
          <ul className="space-y-0.5">
            {workspaceItems.map((item) => {
              const Icon = ICON_MAP[item.icon];
              return (
                <li key={item.href}>
                  <Link href={item.href} className={navLinkClass} title={collapsed ? item.label : undefined}>
                    <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {pinnedClasses.length > 0 && (
          <div>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Pinned Classes
              </p>
            )}
            <ul className="space-y-0.5">
              {pinnedClasses.map((klass) => (
                <li key={klass.id}>
                  <Link
                    href="/dashboard/classes"
                    className={navLinkClass}
                    title={collapsed ? `${klass.gradeName} ${klass.section}` : undefined}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-600">
                      {klass.gradeName[0]}
                    </span>
                    {!collapsed && (
                      <span className="truncate">
                        {klass.gradeName} {klass.section}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200/40 bg-neutral-100/60 p-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6] text-xs font-bold text-white">
            {userInitials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs font-semibold text-neutral-800">{userName}</p>
              <p className="truncate text-[9px] capitalize text-neutral-400">{userRole}</p>
            </div>
          )}
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            {collapsed ? "⏻" : "Logout"}
          </button>
        </form>
      </div>
    </aside>
  );
}
