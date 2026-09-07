import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default async function AnnouncementsPage() {
  await requireDashboardRole(["admin"]);
  return (
    <ComingSoonPage
      title="Announcements"
      description="Publishing school-wide or class-specific announcements is coming soon."
    />
  );
}
