import type { LucideIcon } from "lucide-react";
import {
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
import type { SessionClaims } from "../auth/jwt";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/classes", label: "Classes", icon: Building2 },
  { href: "/dashboard/staff", label: "Staff", icon: Users },
  { href: "/dashboard/students", label: "Students", icon: GraduationCap },
  { href: "/dashboard/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/dashboard/assignments", label: "Assignments", icon: BookOpen },
  { href: "/dashboard/marks", label: "Exams & Marks", icon: Award },
  { href: "/dashboard/timetable", label: "Timetable", icon: Calendar },
  { href: "/dashboard/fees", label: "Fees", icon: Wallet },
  { href: "/dashboard/academic-years", label: "Academic Years", icon: CalendarRange },
];

export const WORKSPACE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/resources", label: "Resources", icon: FolderOpen },
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
    "/dashboard/academic-years",
  ],
  accountant: ["/dashboard", "/dashboard/fees"],
  parent: [],
};

export function getNavItemsForRole(role: SessionClaims["role"]): NavItem[] {
  const allowedHrefs = NAV_HREFS_BY_ROLE[role];
  return ALL_NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));
}
