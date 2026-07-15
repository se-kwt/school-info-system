import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listPeriods } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import { PeriodsView } from "@/components/timetable/PeriodsView";

export default async function PeriodsPage() {
  const claims = requireDashboardRole(["admin"]);
  const periods = await listPeriods(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Periods</h1>
      <PeriodsView initialPeriods={periods} />
    </div>
  );
}
