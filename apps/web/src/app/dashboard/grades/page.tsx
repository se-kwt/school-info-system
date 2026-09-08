import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listGrades } from "@/lib/school-setup/grades";
import { listAcademicYears, getActiveAcademicYear } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { GradesView } from "@/components/school-setup/GradesView";

export default async function GradesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const [grades, academicYears] = await Promise.all([
    listGrades(prisma, claims.schoolId, { academicYearId: activeYear?.id }),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <GradesView initialGrades={grades} academicYears={academicYears} />
    </div>
  );
}
