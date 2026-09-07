import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function GradeBookPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Grade Book"
      description="A consolidated, spreadsheet-style grade book across exams and subjects is coming soon."
    />
  );
}
