import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { SchoolProfileSettings } from "@/components/settings/SchoolProfileSettings";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const claims = await requireDashboardRole(["teacher", "admin", "accountant"]);

  if (claims.role !== "admin") {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });

    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
        <h1 className="mb-4 text-sm font-bold text-neutral-800">Settings</h1>
        <dl className="space-y-3 text-xs">
          <div>
            <dt className="font-semibold text-neutral-400">Name</dt>
            <dd className="text-neutral-800">{user.name}</dd>
          </div>
          <div>
            <dt className="font-semibold text-neutral-400">Phone</dt>
            <dd className="text-neutral-800">{user.phone}</dd>
          </div>
          <div>
            <dt className="font-semibold text-neutral-400">Email</dt>
            <dd className="text-neutral-800">{user.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-neutral-400">Role</dt>
            <dd className="capitalize text-neutral-800">{user.role}</dd>
          </div>
        </dl>
        <form action="/api/auth/logout" method="POST" className="mt-6 border-t border-neutral-100 pt-4">
          <button
            type="submit"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 transition-all hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </div>
    );
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
