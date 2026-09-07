import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function SubjectsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Subjects"
      description="A dedicated, school-wide subjects catalog is planned; subjects are currently managed from within each grade."
    />
  );
}
