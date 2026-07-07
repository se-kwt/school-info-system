import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStudents } from "@/lib/school-setup/students";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { CreateStudentForm } from "@/components/school-setup/CreateStudentForm";

export default async function StudentsPage() {
  const claims = requireDashboardRole(["teacher", "admin"]);
  const isAdmin = claims.role === "admin";
  const [students, classes] = await Promise.all([
    listStudents(prisma, claims.schoolId),
    isAdmin ? listClasses(prisma, claims.schoolId) : Promise.resolve([]),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Students</h1>
      {isAdmin && <CreateStudentForm classes={classes} />}
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Admission No.</th>
            <th className="border-b border-gray-200 pb-2">Class</th>
            <th className="border-b border-gray-200 pb-2">Parent(s)</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td className="border-b border-gray-100 py-2">{student.name}</td>
              <td className="border-b border-gray-100 py-2">{student.admissionNo}</td>
              <td className="border-b border-gray-100 py-2">
                {student.class ? `${student.class.name} ${student.class.section}` : "Unassigned"}
              </td>
              <td className="border-b border-gray-100 py-2">
                {student.parents.map((parent) => `${parent.name} (${parent.phone})`).join(", ") ||
                  "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
