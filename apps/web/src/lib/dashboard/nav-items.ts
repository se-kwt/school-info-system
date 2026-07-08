import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  UserSquare2,
  Folder,
  CheckSquare,
  ClipboardList,
  Award,
  CalendarClock,
  Wallet,
  Bell,
  TrendingUp,
  Link as LinkIcon,
  Settings,
} from "lucide-react";
import type { SessionClaims } from "../auth/jwt";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/classes", label: "Classes", icon: Folder },
  { href: "/dashboard/staff", label: "Staff", icon: UserSquare2 },
  { href: "/dashboard/students", label: "Students", icon: Users },
  { href: "/dashboard/attendance", label: "Attendance", icon: CheckSquare },
  { href: "/dashboard/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/dashboard/marks", label: "Exams & Marks", icon: Award },
  { href: "/dashboard/timetable", label: "Timetable", icon: CalendarClock },
  { href: "/dashboard/fees", label: "Fees", icon: Wallet },
];

export const WORKSPACE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/reports", label: "Reports", icon: TrendingUp },
  { href: "/dashboard/resources", label: "Resources", icon: LinkIcon },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const NAV_HREFS_BY_ROLE: Record<SessionClaims["role"], string[]> = {
  teacher: [
    "/dashboard",
    "/dashboard/students",
    "/dashboard/attendance",
    "/dashboard/assignments",
    "/dashboard/marks",
    "/dashboard/timetable",
  ],
  admin: [
    "/dashboard",
    "/dashboard/classes",
    "/dashboard/staff",
    "/dashboard/students",
    "/dashboard/attendance",
    "/dashboard/assignments",
    "/dashboard/marks",
    "/dashboard/timetable",
    "/dashboard/fees",
  ],
  accountant: ["/dashboard", "/dashboard/fees"],
  parent: [],
};

export function getNavItemsForRole(role: SessionClaims["role"]): NavItem[] {
  const allowedHrefs = NAV_HREFS_BY_ROLE[role];
  return ALL_NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));
}
