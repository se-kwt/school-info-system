import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStudents } from "@/lib/school-setup/students";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { AddStudentPage } from "@/components/school-setup/AddStudentPage";

export default async function AddStudentRoute() {
  const claims = await requireDashboardRole(["admin"]);
  const [students, classes] = await Promise.all([
    listStudents(prisma, claims.schoolId),
    listClasses(prisma, claims.schoolId),
  ]);

  return (
    <div className="p-6">
      <AddStudentPage classes={classes} allStudents={students} />
    </div>
  );
}
