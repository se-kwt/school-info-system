import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAcademicYears, getActiveAcademicYear } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { FacultyAssignmentClassesView } from "@/components/school-setup/FacultyAssignmentClassesView";

export default async function FacultyAssignmentPage() {
  const claims = await requireDashboardRole(["admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const [classes, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId, { academicYearId: activeYear?.id }),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />
    </div>
  );
}
