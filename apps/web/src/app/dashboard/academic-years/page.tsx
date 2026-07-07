import { AcademicYearsView } from "@/components/academic-years/AcademicYearsView";
import { listAcademicYears } from "@/lib/academic-years";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { prisma } from "@/lib/prisma";

export default async function AcademicYearsPage() {
  const claims = requireDashboardRole(["admin"]);
  const years = await listAcademicYears(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Academic Years</h1>
      <AcademicYearsView initialYears={years} />
    </div>
  );
}
