import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { listAllSubjects } from "@/lib/school-setup/subjects";
import { listPeriods } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import { TimetableView } from "@/components/timetable/TimetableView";
import { getActiveAcademicYear } from "@/lib/academic-years";

export default async function TimetablePage() {
  const claims = await requireDashboardRole(["teacher", "admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const classes =
    claims.role === "teacher"
      ? await getClassesForTeacher(prisma, claims.userId, activeYear?.id ?? -1)
      : await listClasses(prisma, claims.schoolId);

  const [subjects, periods] = await Promise.all([
    listAllSubjects(prisma, claims.schoolId),
    listPeriods(prisma, claims.schoolId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Timetable</h1>
        <p className="text-xs text-neutral-400">Weekly periods by class.</p>
      </div>
      <TimetableView
        classes={classes}
        subjects={subjects}
        periods={periods}
        role={claims.role === "teacher" ? "teacher" : "admin"}
      />
    </div>
  );
}
