import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { listStaff } from "@/lib/school-setup/staff";
import { prisma } from "@/lib/prisma";
import { TimetableView } from "@/components/timetable/TimetableView";
import { getActiveAcademicYear } from "@/lib/academic-years";

export default async function TimetablePage() {
  const claims = requireDashboardRole(["teacher", "admin"]);
  const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
  const classes =
    claims.role === "teacher"
      ? (await getClassesForTeacher(prisma, claims.userId, activeYear?.id ?? -1)).map((klass) => ({
          id: klass.id,
          name: klass.name,
          section: klass.section,
        }))
      : await listClasses(prisma, claims.schoolId);

  const teachers =
    claims.role === "admin"
      ? (await listStaff(prisma, claims.schoolId))
          .filter((staff) => staff.role === "teacher")
          .map((staff) => ({ id: staff.id, name: staff.name }))
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Timetable</h1>
        <p className="text-xs text-neutral-400">Weekly periods by class.</p>
      </div>
      <TimetableView
        classes={classes}
        teachers={teachers}
        role={claims.role === "teacher" ? "teacher" : "admin"}
      />
    </div>
  );
}
