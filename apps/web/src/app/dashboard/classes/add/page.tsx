import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listGrades } from "@/lib/school-setup/grades";
import { listAcademicYears } from "@/lib/academic-years";
import { prisma } from "@/lib/prisma";
import { AddClassForm } from "@/components/school-setup/AddClassForm";

export default async function AddClassPage() {
  const claims = await requireDashboardRole(["admin"]);
  const [grades, academicYears] = await Promise.all([
    listGrades(prisma, claims.schoolId),
    listAcademicYears(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <AddClassForm grades={grades} academicYears={academicYears} />
    </div>
  );
}
