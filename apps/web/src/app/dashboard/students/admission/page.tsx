import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function StudentAdmissionPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Student Admission"
      description="A guided, multi-step admission workflow for new students is coming soon."
    />
  );
}
