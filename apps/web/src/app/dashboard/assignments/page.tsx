import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { prisma } from "@/lib/prisma";
import { AssignmentsView } from "@/components/assignments/AssignmentsView";

export default async function AssignmentsPage() {
  const claims = requireDashboardRole(["teacher", "admin"]);
  const classes =
    claims.role === "teacher"
      ? (await getClassesForTeacher(prisma, claims.userId)).map((klass) => ({
          id: klass.id,
          name: klass.name,
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
