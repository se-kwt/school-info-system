import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { CreateClassForm } from "@/components/school-setup/CreateClassForm";

export default async function ClassesPage() {
  const claims = requireDashboardRole(["admin"]);
  const classes = await listClasses(prisma, claims.schoolId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Classes</h1>
        <p className="text-xs text-neutral-400">Every class in the school.</p>
      </div>

      <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <h2 className="mb-3 text-sm font-bold text-neutral-800">Add Class</h2>
        <CreateClassForm />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Section</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((klass) => (
              <tr key={klass.id}>
                <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                  {klass.name}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {klass.section}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
