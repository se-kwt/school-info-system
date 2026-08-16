import { requireParentRole } from "@/lib/auth/require-parent-role";
import { ComingSoon } from "@/components/ComingSoon";
import { Settings } from "lucide-react";

export default async function ParentSettingsPage() {
  await requireParentRole();
  return <ComingSoon feature="Settings" icon={Settings} />;
}
