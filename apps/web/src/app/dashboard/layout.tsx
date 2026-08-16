import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getNavItemsForRole, WORKSPACE_NAV_ITEMS } from "@/lib/dashboard/nav-items";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { Sidebar } from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = await requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: claims.schoolId } });
  const navItems = getNavItemsForRole(claims.role);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);

  const pinnedClasses =
    claims.role === "teacher"
      ? (await getClassesForTeacher(prisma, claims.userId, activeYear?.id ?? -1)).slice(0, 3)
      : claims.role === "admin"
        ? (await listClasses(prisma, claims.schoolId)).slice(0, 3)
        : [];

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <Sidebar
        navItems={navItems}
        workspaceItems={WORKSPACE_NAV_ITEMS}
        pinnedClasses={pinnedClasses}
        userName={user.name}
        userInitials={initials}
        userRole={claims.role}
        schoolName={school.name}
        schoolLogoUrl={school.logoUrl}
      />
      <div className="flex flex-1 flex-col">
        <header className="border-b border-neutral-200/50 px-6 py-4">
          <h1 className="text-base font-bold tracking-tight text-neutral-900 lg:text-lg">
            Welcome, {user.name}
          </h1>
          <p className="text-[11px] font-medium capitalize text-neutral-400 lg:text-xs">
            {claims.role} workspace
          </p>
        </header>
        <main className="flex-1 bg-[#F8F9FA]/80 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
