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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Students</h1>
        <p className="text-xs text-neutral-400">
          Every student enrolled {isAdmin ? "in the school" : "in your classes"}.
        </p>
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
          <h2 className="mb-3 text-sm font-bold text-neutral-800">Add Student</h2>
          <CreateStudentForm classes={classes} />
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Admission No.</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Class</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Parent(s)</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                  {student.name}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.admissionNo}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.class.name} {student.class.section}
                </td>
                <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                  {student.parents.map((parent) => `${parent.name} (${parent.phone})`).join(", ") ||
                    "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
