import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function TeacherTimetablePage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Teacher Timetable"
      description="A per-teacher weekly schedule view, across all their classes, is coming soon."
    />
  );
}
