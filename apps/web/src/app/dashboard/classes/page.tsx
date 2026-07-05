import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { CreateClassForm } from "@/components/school-setup/CreateClassForm";

export default async function ClassesPage() {
  const claims = requireDashboardRole(["admin"]);
  const classes = await listClasses(prisma, claims.schoolId);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Classes</h1>
      <CreateClassForm />
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Section</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((klass) => (
            <tr key={klass.id}>
              <td className="border-b border-gray-100 py-2">{klass.name}</td>
              <td className="border-b border-gray-100 py-2">{klass.section}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
