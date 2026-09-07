import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StudentTransferPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Student Transfer"
      description="Transferring a student out to, or in from, another school is coming soon."
    />
  );
}
