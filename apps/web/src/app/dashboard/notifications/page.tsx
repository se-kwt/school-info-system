import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";
import { Bell } from "lucide-react";

export default function NotificationsPage() {
  requireDashboardRole(["teacher", "admin", "accountant"]);
  return <ComingSoon feature="Notifications" icon={Bell} />;
}
