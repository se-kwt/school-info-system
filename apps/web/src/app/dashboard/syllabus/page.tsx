import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function SyllabusPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Syllabus"
      description="Syllabus planning and version tracking across subjects is coming soon."
    />
  );
}
