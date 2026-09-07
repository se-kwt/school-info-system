import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function DepartmentsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Departments" description="Organizing staff into departments is coming soon." />
  );
}
