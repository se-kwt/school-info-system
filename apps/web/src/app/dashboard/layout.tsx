import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getNavItemsForRole } from "@/lib/dashboard/nav-items";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const claims = requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const navItems = getNavItemsForRole(claims.role);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-gray-50 p-4">
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full rounded px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-200"
          >
            Logout
          </button>
        </form>
      </aside>
      <div className="flex-1">
        <header className="flex justify-end border-b border-gray-200 p-4 text-sm text-gray-600">
          {user.name} ({claims.role})
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
