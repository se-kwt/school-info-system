import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function OutstandingFeesPage() {
  await requireDashboardRole(["admin", "accountant"]);
  return (
    <ComingSoonPage
      title="Outstanding Fees"
      description="A roster of students with pending or overdue fee balances is coming soon."
    />
  );
}
