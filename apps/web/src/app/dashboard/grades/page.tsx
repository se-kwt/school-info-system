import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listGrades } from "@/lib/school-setup/grades";
import { prisma } from "@/lib/prisma";
import { GradesView } from "@/components/school-setup/GradesView";

export default async function GradesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const grades = await listGrades(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Grades</h1>
      <GradesView initialGrades={grades} />
    </div>
  );
}
