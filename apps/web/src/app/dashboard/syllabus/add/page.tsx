import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AddSyllabusPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Add Syllabus"
      description="Creating a new syllabus entry is coming soon."
    />
  );
}
