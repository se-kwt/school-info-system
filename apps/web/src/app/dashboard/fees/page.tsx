import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { FeesView } from "@/components/fees/FeesView";

export default async function FeesPage() {
  const claims = await requireDashboardRole(["admin", "accountant"]);
  const classes = await listClasses(prisma, claims.schoolId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Fees</h1>
        <p className="text-xs text-neutral-400">Fee structures and payment roster by class.</p>
      </div>
      <FeesView classes={classes} role={claims.role === "admin" ? "admin" : "accountant"} />
    </div>
  );
}
