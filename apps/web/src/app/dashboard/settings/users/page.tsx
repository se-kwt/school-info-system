import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function UsersAndRolesPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Users & Roles"
      description="Managing staff user accounts and their assigned roles is coming soon."
    />
  );
}
