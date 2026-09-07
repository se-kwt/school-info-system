import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function DesignationsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Designations" description="Managing staff job titles and designations is coming soon." />
  );
}
