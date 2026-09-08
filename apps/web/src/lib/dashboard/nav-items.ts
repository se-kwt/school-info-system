import type { SessionClaims } from "../auth/jwt";

export type IconName =
  | "LayoutDashboard"
  | "Layers"
  | "Building2"
  | "BookMarked"
  | "Clock"
  | "CalendarClock"
  | "GraduationCap"
  | "Users"
  | "ClipboardCheck"
  | "BookOpen"
  | "Award"
  | "Wallet"
  | "CalendarRange"
  | "TrendingUp"
  | "CalendarDays"
  | "Bell"
  | "FileBarChart"
  | "Settings";

type Role = SessionClaims["role"];

export interface NavChildLeaf {
  href: string;
  label: string;
}

export interface NavTopLeaf {
  href: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  icon: IconName;
  children: NavChildLeaf[];
}

export type NavEntry = NavTopLeaf | NavGroup;

export interface NavSection {
  label: string;
  items: NavEntry[];
}

interface NavChildLeafDef extends NavChildLeaf {
  roles: Role[];
}

interface NavTopLeafDef extends NavTopLeaf {
  roles: Role[];
}

interface NavGroupDef {
  label: string;
  icon: IconName;
  children: NavChildLeafDef[];
}

type NavEntryDef = NavTopLeafDef | NavGroupDef;

interface NavSectionDef {
  label: string;
  items: NavEntryDef[];
}

function isGroupDef(entry: NavEntryDef): entry is NavGroupDef {
  return "children" in entry;
}

function stripChildRoles(leaf: NavChildLeafDef): NavChildLeaf {
  const { roles: _roles, ...rest } = leaf;
  return rest;
}

function stripTopLeafRoles(leaf: NavTopLeafDef): NavTopLeaf {
  const { roles: _roles, ...rest } = leaf;
  return rest;
}

const NAV_TREE: NavSectionDef[] = [
  {
    label: "Main Menu",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: ["teacher", "admin", "accountant"] }],
  },
  {
    label: "Academic",
    items: [
      {
        label: "Grades",
        icon: "Layers",
        children: [
          { href: "/dashboard/grades", label: "All Grades", roles: ["admin"] },
          { href: "/dashboard/grades/add", label: "Add Grade", roles: ["admin"] },
        ],
      },
      {
        label: "Classes",
        icon: "Building2",
        children: [
          { href: "/dashboard/classes", label: "All Classes", roles: ["admin"] },
          { href: "/dashboard/classes/add", label: "Add Class", roles: ["admin"] },
        ],
      },
      { href: "/dashboard/subjects", label: "Subjects", icon: "BookMarked", roles: ["admin"] },
      {
        label: "Periods",
        icon: "Clock",
        children: [{ href: "/dashboard/periods", label: "Period Management", roles: ["admin"] }],
      },
      {
        label: "Timetable",
        icon: "CalendarClock",
        children: [
          { href: "/dashboard/timetable", label: "Class Timetable", roles: ["teacher", "admin"] },
          { href: "/dashboard/timetable/teacher", label: "Teacher Timetable", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Students",
        icon: "GraduationCap",
        children: [
          { href: "/dashboard/students", label: "All Students", roles: ["teacher", "admin"] },
          { href: "/dashboard/students/add", label: "Add Student", roles: ["admin"] },
          { href: "/dashboard/students/admission", label: "Student Admission", roles: ["admin"] },
          { href: "/dashboard/students/change-class", label: "Change Grade/Class", roles: ["admin"] },
          { href: "/dashboard/students/transfer", label: "Student Transfer", roles: ["admin"] },
        ],
      },
      {
        label: "Staff",
        icon: "Users",
        children: [
          { href: "/dashboard/staff", label: "All Staff", roles: ["admin"] },
          { href: "/dashboard/staff/add", label: "Add Staff", roles: ["admin"] },
          { href: "/dashboard/staff/departments", label: "Departments", roles: ["admin"] },
          { href: "/dashboard/staff/designations", label: "Designations", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "Progress",
    items: [
      {
        label: "Attendance",
        icon: "ClipboardCheck",
        children: [
          { href: "/dashboard/attendance", label: "Student Attendance", roles: ["teacher", "admin"] },
          { href: "/dashboard/attendance/staff", label: "Staff Attendance", roles: ["admin"] },
        ],
      },
      {
        label: "Assignments",
        icon: "BookOpen",
        children: [
          { href: "/dashboard/assignments", label: "All Assignments", roles: ["teacher", "admin"] },
          { href: "/dashboard/assignments", label: "Create Assignment", roles: ["teacher", "admin"] },
        ],
      },
      {
        label: "Exams & Marks",
        icon: "Award",
        children: [
          { href: "/dashboard/marks", label: "Exams", roles: ["teacher", "admin"] },
          { href: "/dashboard/marks", label: "Marks", roles: ["teacher", "admin"] },
          { href: "/dashboard/marks/gradebook", label: "Grade Book", roles: ["admin"] },
          { href: "/dashboard/marks/report-cards", label: "Report Cards", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Fees",
        icon: "Wallet",
        children: [
          { href: "/dashboard/fees", label: "Fee Structure", roles: ["admin", "accountant"] },
          { href: "/dashboard/fees", label: "Fee Collection", roles: ["admin", "accountant"] },
          { href: "/dashboard/fees/payments", label: "Payments", roles: ["admin", "accountant"] },
          { href: "/dashboard/fees/outstanding", label: "Outstanding Fees", roles: ["admin", "accountant"] },
        ],
      },
    ],
  },
  {
    label: "School Management",
    items: [
      {
        label: "Academic Years",
        icon: "CalendarRange",
        children: [
          { href: "/dashboard/academic-years", label: "All Academic Years", roles: ["admin"] },
          { href: "/dashboard/academic-years", label: "Add Academic Year", roles: ["admin"] },
        ],
      },
      {
        label: "Promotion",
        icon: "TrendingUp",
        children: [
          { href: "/dashboard/academic-years/promote", label: "Promote Students", roles: ["admin"] },
          { href: "/dashboard/academic-years/promote/history", label: "Promotion History", roles: ["admin"] },
        ],
      },
      { href: "/dashboard/academic-calendar", label: "Academic Calendar", icon: "CalendarDays", roles: ["admin"] },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        label: "Notifications",
        icon: "Bell",
        children: [
          { href: "/dashboard/notifications/announcements", label: "Announcements", roles: ["admin"] },
          { href: "/dashboard/notifications", label: "In-App Notifications", roles: ["teacher", "admin", "accountant"] },
          { href: "/dashboard/notifications/events", label: "Events", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        label: "Reports",
        icon: "FileBarChart",
        children: [
          { href: "/dashboard/reports/students", label: "Student Reports", roles: ["admin"] },
          { href: "/dashboard/reports/academic", label: "Academic Reports", roles: ["admin"] },
          { href: "/dashboard/reports/attendance", label: "Attendance Reports", roles: ["admin"] },
          { href: "/dashboard/reports/staff", label: "Staff Reports", roles: ["admin"] },
          { href: "/dashboard/reports/fees", label: "Fee Reports", roles: ["admin"] },
        ],
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        label: "Settings",
        icon: "Settings",
        children: [
          { href: "/dashboard/settings", label: "School Settings", roles: ["teacher", "admin", "accountant"] },
          { href: "/dashboard/settings/users", label: "Users & Roles", roles: ["admin"] },
          { href: "/dashboard/settings/permissions", label: "Permissions", roles: ["admin"] },
          { href: "/dashboard/settings/system", label: "System Settings", roles: ["admin"] },
        ],
      },
    ],
  },
];

export function getNavSectionsForRole(role: Role): NavSection[] {
  const sections: NavSection[] = [];
  for (const section of NAV_TREE) {
    const items: NavEntry[] = [];
    for (const entry of section.items) {
      if (isGroupDef(entry)) {
        const children = entry.children.filter((child) => child.roles.includes(role)).map(stripChildRoles);
        if (children.length > 0) {
          items.push({ label: entry.label, icon: entry.icon, children });
        }
      } else if (entry.roles.includes(role)) {
        items.push(stripTopLeafRoles(entry));
      }
    }
    if (items.length > 0) {
      sections.push({ label: section.label, items });
    }
  }
  return sections;
}
