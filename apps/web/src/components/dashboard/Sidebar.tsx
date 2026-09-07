"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Layers,
  Building2,
  BookMarked,
  ScrollText,
  Clock,
  CalendarClock,
  GraduationCap,
  Users,
  ClipboardCheck,
  BookOpen,
  Award,
  Wallet,
  CalendarRange,
  TrendingUp,
  CalendarDays,
  Bell,
  FileBarChart,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IconName, NavSection, NavEntry, NavGroup, NavTopLeaf, NavChildLeaf } from "@/lib/dashboard/nav-items";
import { SchoolLogo } from "@/components/SchoolLogo";

const ICON_MAP: Record<IconName, LucideIcon> = {
  LayoutDashboard,
  Layers,
  Building2,
  BookMarked,
  ScrollText,
  Clock,
  CalendarClock,
  GraduationCap,
  Users,
  ClipboardCheck,
  BookOpen,
  Award,
  Wallet,
  CalendarRange,
  TrendingUp,
  CalendarDays,
  Bell,
  FileBarChart,
  Settings,
};

const STORAGE_KEY = "sidebar-collapsed";

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

function flattenHrefs(items: NavEntry[]): string[] {
  return items.flatMap((entry) => (isGroup(entry) ? entry.children.map((c) => c.href) : [entry.href]));
}

export function Sidebar({
  sections,
  pinnedClasses,
  userName,
  userInitials,
  userRole,
  schoolName,
  schoolLogoUrl,
}: {
  sections: NavSection[];
  pinnedClasses: { id: number; gradeName: string; section: string }[];
  userName: string;
  userInitials: string;
  userRole: string;
  schoolName: string;
  schoolLogoUrl: string | null;
}) {
  const pathname = usePathname();

  // Among all leaf hrefs (including those nested inside groups), the "active"
  // one is the longest href that either exactly matches the current pathname
  // or is a parent route of it -- the longest match wins so a shorter parent
  // route like "/dashboard/students" isn't marked active alongside a more
  // specific child route like "/dashboard/students/add". The dashboard root
  // ("/dashboard") is excluded from prefix matching: it's a leaf page, not a
  // section prefix, and every dashboard route starts with "/dashboard/" so
  // it would otherwise always win by default when no other href matches.
  function hrefMatchesPathname(href: string): boolean {
    if (pathname === href) return true;
    if (href === "/dashboard") return false;
    return pathname?.startsWith(`${href}/`) ?? false;
  }

  const allHrefs = sections.flatMap((section) => flattenHrefs(section.items));
  const activeHref = allHrefs
    .filter((href) => hrefMatchesPathname(href))
    .sort((a, b) => b.length - a.length)[0];

  function isActive(href: string): boolean {
    return href === activeHref;
  }

  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const section of sections) {
      for (const entry of section.items) {
        if (isGroup(entry) && entry.children.some((child) => child.href === activeHref)) {
          initial.add(`${section.label}:${entry.label}`);
        }
      }
    }
    return initial;
  });

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function navLinkClass(active: boolean): string {
    return `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
      active
        ? "bg-indigo-50 text-indigo-700"
        : "text-neutral-500 hover:bg-[#EAECF0]/30 hover:text-neutral-800"
    }`;
  }

  function renderTopLeaf(item: NavTopLeaf) {
    const Icon = ICON_MAP[item.icon];
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={navLinkClass(active)}
          title={collapsed ? item.label : undefined}
          aria-current={active ? "page" : undefined}
        >
          <Icon className={`h-4 w-4 shrink-0 ${active ? "text-indigo-600" : "text-neutral-400"}`} />
          {!collapsed && <span>{item.label}</span>}
        </Link>
      </li>
    );
  }

  // Children carry no icon of their own (the source mockup only puts an icon
  // on the top-level row). When the sidebar is collapsed to its icon rail, a
  // flattened child still needs *some* icon, so it borrows its parent
  // group's -- see the two call sites below.
  function renderChild(item: NavChildLeaf, groupIcon: IconName) {
    const Icon = ICON_MAP[groupIcon];
    const active = isActive(item.href);
    return (
      <li key={`${item.href}:${item.label}`}>
        <Link
          href={item.href}
          className={`${navLinkClass(active)} ${collapsed ? "" : "pl-8"}`}
          title={collapsed ? item.label : undefined}
          aria-current={active ? "page" : undefined}
        >
          {collapsed && <Icon className={`h-4 w-4 shrink-0 ${active ? "text-indigo-600" : "text-neutral-400"}`} />}
          {!collapsed && <span>{item.label}</span>}
        </Link>
      </li>
    );
  }

  function renderGroup(sectionLabel: string, group: NavGroup) {
    const key = `${sectionLabel}:${group.label}`;
    const expanded = expandedGroups.has(key);
    const Icon = ICON_MAP[group.icon];
    const groupActive = group.children.some((child) => isActive(child.href));
    return (
      <li key={key}>
        <button
          type="button"
          onClick={() => toggleGroup(key)}
          aria-expanded={expanded}
          className={`${navLinkClass(groupActive && !expanded)} w-full justify-between`}
        >
          <span className="flex items-center gap-2.5">
            <Icon className={`h-4 w-4 shrink-0 ${groupActive ? "text-indigo-600" : "text-neutral-400"}`} />
            <span>{group.label}</span>
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        {expanded && (
          <ul className="mt-0.5 space-y-0.5">
            {group.children.map((child) => renderChild(child, group.icon))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <aside
      className={`flex shrink-0 flex-col justify-between border-r border-neutral-200/70 bg-neutral-50/95 transition-all ${
        collapsed ? "w-16" : "w-[260px]"
      }`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <SchoolLogo logoUrl={schoolLogoUrl} schoolName={schoolName} className="h-7 w-7" />
            {!collapsed && (
              <div>
                <p className="truncate text-sm font-semibold tracking-tight text-neutral-900">{schoolName}</p>
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
        {sections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((entry) =>
                isGroup(entry)
                  ? collapsed
                    ? entry.children.map((child) => renderChild(child, entry.icon))
                    : renderGroup(section.label, entry)
                  : renderTopLeaf(entry)
              )}
            </ul>
          </div>
        ))}

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
                    className={navLinkClass(false)}
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
