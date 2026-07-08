import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  requireDashboardRole(["teacher", "admin", "accountant"]);
  return <ComingSoon feature="Settings" icon={Settings} />;
}
