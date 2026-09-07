import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function PaymentsPage() {
  await requireDashboardRole(["admin", "accountant"]);
  return (
    <ComingSoonPage title="Payments" description="A unified log of individual fee payment transactions is coming soon." />
  );
}
