import { PromotionWizard } from "@/components/academic-years/PromotionWizard";
import { listAcademicYears } from "@/lib/academic-years";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { prisma } from "@/lib/prisma";
import { listClasses } from "@/lib/school-setup/classes";

export default async function PromoteAcademicYearPage() {
  const claims = requireDashboardRole(["admin"]);
  const [years, classes] = await Promise.all([
    listAcademicYears(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);
  const upcomingYears = years.filter((year) => year.status === "upcoming");

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Academic Year Promotion</h1>
      <p className="mt-1 text-sm text-gray-600">
        Create a new academic year on the Academic Years page first if none is listed below.
      </p>
      <PromotionWizard upcomingYears={upcomingYears} classes={classes} />
    </div>
  );
}
