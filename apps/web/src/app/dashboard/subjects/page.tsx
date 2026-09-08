import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listGrades } from "@/lib/school-setup/grades";
import { prisma } from "@/lib/prisma";
import { SubjectsView } from "@/components/school-setup/SubjectsView";

export default async function SubjectsPage() {
  const claims = await requireDashboardRole(["admin"]);
  const grades = await listGrades(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <SubjectsView initialGrades={grades} />
    </div>
  );
}
