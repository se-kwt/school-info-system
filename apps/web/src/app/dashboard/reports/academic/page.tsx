import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AcademicReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Academic Reports"
      description="School-wide academic performance reports across classes are coming soon."
    />
  );
}
