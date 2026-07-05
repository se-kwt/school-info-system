import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";

export default async function DashboardHomePage() {
  const claims = requireDashboardRole(["teacher", "admin", "accountant"]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">
        Welcome, {user.name} ({claims.role})
      </h1>
    </div>
  );
}
