import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { FacultyAssignmentClassesView } from "@/components/school-setup/FacultyAssignmentClassesView";

export default async function FacultyAssignmentPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [classes, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />
    </div>
  );
}
