import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";
import { TrendingUp } from "lucide-react";

export default async function ReportsPage() {
  await requireDashboardRole(["teacher", "admin", "accountant"]);
  return <ComingSoon feature="Reports" icon={TrendingUp} />;
}
