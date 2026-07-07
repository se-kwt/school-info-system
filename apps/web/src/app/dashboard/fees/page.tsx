import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { FeesView } from "@/components/fees/FeesView";

export default async function FeesPage() {
  const claims = requireDashboardRole(["admin", "accountant"]);
  const classes = await listClasses(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Fees</h1>
      <FeesView classes={classes} role={claims.role === "admin" ? "admin" : "accountant"} />
    </div>
  );
}
