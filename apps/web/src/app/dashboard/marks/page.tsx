import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getClassesForTeacher } from "@/lib/data/scoped-queries";
import { listClasses } from "@/lib/school-setup/classes";
import { listExams } from "@/lib/exams";
import { prisma } from "@/lib/prisma";
import { MarksView } from "@/components/marks/MarksView";
import { getActiveAcademicYear } from "@/lib/academic-years";

export default async function MarksPage() {
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

  const exams = await listExams(prisma, claims.schoolId);

  const teacherSubjects =
    claims.role === "teacher"
      ? await prisma.classTeacher.findMany({
          where: { teacherUserId: claims.userId, academicYearId: activeYear?.id ?? -1 },
          select: { classId: true, subject: true },
        })
      : [];

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">Exams &amp; Marks</h1>
      <MarksView
        exams={exams}
        classes={classes}
        teacherSubjects={teacherSubjects}
        role={claims.role === "teacher" ? "teacher" : "admin"}
      />
    </div>
  );
}
