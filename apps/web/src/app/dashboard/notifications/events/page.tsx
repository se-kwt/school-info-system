import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function EventsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Events" description="Scheduling and listing school events is coming soon." />
  );
}
