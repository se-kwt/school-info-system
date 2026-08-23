import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { ComingSoon } from "@/components/ComingSoon";
import { SchoolProfileSettings } from "@/components/settings/SchoolProfileSettings";
import { prisma } from "@/lib/prisma";
import { Settings } from "lucide-react";

export default async function SettingsPage() {
  const claims = await requireDashboardRole(["teacher", "admin", "accountant"]);

  if (claims.role !== "admin") {
    return <ComingSoon feature="Settings" icon={Settings} />;
  }

  const school = await prisma.school.findUniqueOrThrow({ where: { id: claims.schoolId } });

  return (
    <SchoolProfileSettings
      initialLogoUrl={school.logoUrl}
      schoolName={school.name}
      initialAddress={school.address ?? ""}
      initialPhone={school.phone ?? ""}
      initialEmail={school.email ?? ""}
      initialPrincipalName={school.principalName ?? ""}
    />
  );
}
