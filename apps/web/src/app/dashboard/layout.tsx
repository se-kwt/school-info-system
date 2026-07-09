import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getNavItemsForRole, WORKSPACE_NAV_ITEMS } from "@/lib/dashboard/nav-items";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { getActiveAcademicYear } from "@/lib/academic-years";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
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

  const navLinkClass =
    "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition-all hover:bg-[#EAECF0]/30 hover:text-neutral-800";

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <aside className="flex w-[260px] shrink-0 flex-col justify-between border-r border-neutral-200/70 bg-neutral-50/95">
        <div className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs font-bold text-white">
              SI
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-neutral-900">
                School Info System
              </p>
              <p className="text-[10px] font-medium text-neutral-400">School Workspace</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-1">
          <div>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Main Menu
            </p>
            <ul className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={navLinkClass}>
                      <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Workspace
            </p>
            <ul className="space-y-0.5">
              {WORKSPACE_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={navLinkClass}>
                      <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {pinnedClasses.length > 0 && (
            <div>
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Pinned Classes
              </p>
              <ul className="space-y-0.5">
                {pinnedClasses.map((klass) => (
                  <li key={klass.id}>
                    <Link href="/dashboard/classes" className={navLinkClass}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-600">
                        {klass.name[0]}
                      </span>
                      <span className="truncate">
                        {klass.name} {klass.section}
                      </span>
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
              {initials}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs font-semibold text-neutral-800">{user.name}</p>
              <p className="truncate text-[9px] capitalize text-neutral-400">{claims.role}</p>
            </div>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-black"
            >
              Logout
            </button>
          </form>
        </div>
      </aside>
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
