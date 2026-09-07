import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function ChangeGradeClassPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Change Grade/Class"
      description="Moving a single student to a different grade or class mid-year is coming soon."
    />
  );
}
