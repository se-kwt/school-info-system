import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { listAllSubjects } from "@/lib/school-setup/subjects";
import { prisma } from "@/lib/prisma";
import { AddStaffPage } from "@/components/school-setup/AddStaffPage";

export default async function AddStaffRoute() {
  const claims = await requireDashboardRole(["admin"]);
  const [classes, subjects] = await Promise.all([
    listClasses(prisma, claims.schoolId),
    listAllSubjects(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <AddStaffPage classes={classes} subjects={subjects} />
    </div>
  );
}
