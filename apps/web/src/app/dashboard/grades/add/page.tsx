import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { AddGradeForm } from "@/components/school-setup/AddGradeForm";

export default async function AddGradePage() {
  await requireDashboardRole(["admin"]);
  return (
    <div className="p-6">
      <AddGradeForm />
    </div>
  );
}
