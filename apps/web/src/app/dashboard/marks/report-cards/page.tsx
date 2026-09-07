import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function ReportCardsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Report Cards" description="Generating printable student report cards is coming soon." />
  );
}
