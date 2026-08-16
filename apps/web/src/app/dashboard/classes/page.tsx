import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listGrades } from "@/lib/school-setup/grades";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { ClassesView } from "@/components/school-setup/ClassesView";

export default async function ClassesPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [classes, grades, academicYears] = await Promise.all([
    listClasses(prisma, claims.schoolId, { includeArchived: true }),
    listGrades(prisma, claims.schoolId),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Classes</h1>
      <ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />
    </div>
  );
}
