import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AcademicCalendarPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Academic Calendar"
      description="A school-wide calendar of terms, holidays, and key academic dates is coming soon."
    />
  );
}
