import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStudents } from "@/lib/school-setup/students";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { StudentsView } from "@/components/school-setup/StudentsView";

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
      <StudentsView initialStudents={students} classes={classes} isAdmin={isAdmin} />
    </div>
  );
}
