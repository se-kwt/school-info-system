import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { AssignmentsView } from "@/components/assignments/AssignmentsView";
import { getActiveAcademicYear } from "@/lib/academic-years";

export default async function AssignmentsPage() {
  const claims = requireDashboardRole(["teacher", "admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const classes =
    claims.role === "teacher"
      ? (await getClassesForTeacher(prisma, claims.userId, activeYear?.id ?? -1)).map((klass) => ({
          id: klass.id,
          name: klass.gradeName,
          section: klass.section,
        }))
      : await listClasses(prisma, claims.schoolId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Assignments</h1>
        <p className="text-xs text-neutral-400">Post assignments and track submission status.</p>
      </div>
      <AssignmentsView
        classes={classes}
        role={claims.role === "teacher" ? "teacher" : "admin"}
        currentUserId={claims.userId}
      />
    </div>
  );
}
