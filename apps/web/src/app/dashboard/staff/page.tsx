import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStaff } from "@/lib/school-setup/staff";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { StaffView } from "@/components/school-setup/StaffView";

export default async function StaffPage() {
  const claims = requireDashboardRole(["admin"]);
  const [staff, classes] = await Promise.all([
    listStaff(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Staff</h1>
      <StaffView initialStaff={staff} classes={classes} currentUserId={claims.userId} />
    </div>
  );
}
