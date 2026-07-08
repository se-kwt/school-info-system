import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStaff } from "@/lib/school-setup/staff";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { CreateStaffForm } from "@/components/school-setup/CreateStaffForm";

const ROLE_BADGE: Record<string, string> = {
  teacher: "bg-blue-50 text-blue-600",
  admin: "bg-purple-50 text-purple-600",
  accountant: "bg-amber-50 text-amber-600",
};

export default async function StaffPage() {
  const claims = requireDashboardRole(["admin"]);
  const [staff, classes] = await Promise.all([
    listStaff(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Staff</h1>
        <p className="text-xs text-neutral-400">Every teacher, admin, and accountant in the school.</p>
      </div>

      <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <h2 className="mb-3 text-sm font-bold text-neutral-800">Add Staff</h2>
        <CreateStaffForm classes={classes} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Phone</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Role</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Class Assignment</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id}>
                <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                  {member.name}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {member.phone}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${ROLE_BADGE[member.role]}`}
                  >
                    {member.role}
                  </span>
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {member.classAssignment
                    ? `${member.classAssignment.className} ${member.classAssignment.section} (${member.classAssignment.subject})`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
