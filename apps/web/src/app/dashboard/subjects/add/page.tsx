import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AddSubjectPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Add Subject"
      description="Creating subjects from a school-wide catalog is coming soon."
    />
  );
}
