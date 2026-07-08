import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";
import { Link as LinkIcon } from "lucide-react";

export default function ResourcesPage() {
  requireDashboardRole(["teacher", "admin", "accountant"]);
  return <ComingSoon feature="Resources" icon={LinkIcon} />;
}
