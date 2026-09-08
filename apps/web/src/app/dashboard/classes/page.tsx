import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAcademicYears, getActiveAcademicYear } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { ClassesView } from "@/components/school-setup/ClassesView";

export default async function ClassesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const [classes, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId, { includeArchived: true, academicYearId: activeYear?.id }),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <ClassesView initialClasses={classes} academicYears={academicYears} />
    </div>
  );
}
