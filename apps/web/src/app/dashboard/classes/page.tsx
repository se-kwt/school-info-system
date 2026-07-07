import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { ClassesView } from "@/components/school-setup/ClassesView";

export default async function ClassesPage() {
  const claims = requireDashboardRole(["admin"]);
  const classes = await listClasses(prisma, claims.schoolId, { includeArchived: true });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Classes</h1>
      <ClassesView initialClasses={classes} />
    </div>
  );
}
