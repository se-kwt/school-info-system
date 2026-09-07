import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function PermissionsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Permissions" description="Fine-grained, per-feature permission controls are coming soon." />
  );
}
