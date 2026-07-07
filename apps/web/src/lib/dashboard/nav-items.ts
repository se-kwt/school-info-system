import type { SessionClaims } from "../auth/jwt";

export interface NavItem {
  href: string;
  label: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/classes", label: "Classes" },
  { href: "/dashboard/staff", label: "Staff" },
  { href: "/dashboard/students", label: "Students" },
  { href: "/dashboard/attendance", label: "Attendance" },
  { href: "/dashboard/assignments", label: "Assignments" },
  { href: "/dashboard/marks", label: "Exams & Marks" },
  { href: "/dashboard/timetable", label: "Timetable" },
  { href: "/dashboard/fees", label: "Fees" },
  { href: "/dashboard/academic-years", label: "Academic Years" },
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
