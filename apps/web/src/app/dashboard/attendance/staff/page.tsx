import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StaffAttendancePage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage title="Staff Attendance" description="Daily attendance tracking for staff is coming soon." />
  );
}
