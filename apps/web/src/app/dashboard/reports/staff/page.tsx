import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StaffReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Staff Reports"
      description="Staff headcount, attendance, and workload reports are coming soon."
    />
  );
}
