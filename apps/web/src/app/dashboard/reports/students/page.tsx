import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StudentReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Student Reports"
      description="Cross-cutting reports on student demographics and enrollment are coming soon."
    />
  );
}
