import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AttendanceReportsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Attendance Reports"
      description="Aggregate attendance reports by class, subject, and date range are coming soon."
    />
  );
}
