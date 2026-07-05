import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";

export default function FeesPage() {
  requireDashboardRole(["admin", "accountant"]);
  return <ComingSoon feature="Fees" />;
}
