import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function FeeReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Fee Reports"
      description="Collection and outstanding-balance summaries by class and term are coming soon."
    />
  );
}
