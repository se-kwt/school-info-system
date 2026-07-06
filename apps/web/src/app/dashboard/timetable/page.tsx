import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { listStaff } from "@/lib/school-setup/staff";
import { prisma } from "@/lib/prisma";
import { TimetableView } from "@/components/timetable/TimetableView";

export default async function TimetablePage() {
  const claims = requireDashboardRole(["teacher", "admin"]);
  const classes =
    claims.role === "teacher"
      ? (await getClassesForTeacher(prisma, claims.userId)).map((klass) => ({
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
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Timetable</h1>
      <TimetableView
        classes={classes}
        teachers={teachers}
        role={claims.role === "teacher" ? "teacher" : "admin"}
      />
    </div>
  );
}
