import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function SystemSettingsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="System Settings" description="School-wide system configuration options are coming soon." />
  );
}
