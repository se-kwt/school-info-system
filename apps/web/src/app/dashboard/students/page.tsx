import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";

export default function StudentsPage() {
  requireDashboardRole(["teacher", "admin"]);
  return <ComingSoon feature="Students" />;
}
