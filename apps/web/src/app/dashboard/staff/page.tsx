import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStaff } from "@/lib/school-setup/staff";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { CreateStaffForm } from "@/components/school-setup/CreateStaffForm";

export default async function StaffPage() {
  const claims = requireDashboardRole(["admin"]);
  const [staff, classes] = await Promise.all([
    listStaff(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Staff</h1>
      <CreateStaffForm classes={classes} />
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Phone</th>
            <th className="border-b border-gray-200 pb-2">Role</th>
            <th className="border-b border-gray-200 pb-2">Class Assignment</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id}>
              <td className="border-b border-gray-100 py-2">{member.name}</td>
              <td className="border-b border-gray-100 py-2">{member.phone}</td>
              <td className="border-b border-gray-100 py-2">{member.role}</td>
              <td className="border-b border-gray-100 py-2">
                {member.classAssignment
                  ? `${member.classAssignment.className} ${member.classAssignment.section} (${member.classAssignment.subject})`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
