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
      ? await getClassesForTeacher(prisma, claims.userId, activeYear?.id ?? -1)
      : await listClasses(prisma, claims.schoolId);

  const exams = await listExams(prisma, claims.schoolId);

  const teacherSubjectLinks =
    claims.role === "teacher"
      ? await prisma.classTeacher.findMany({
          where: { teacherUserId: claims.userId, academicYearId: activeYear?.id ?? -1 },
          include: { subject: true },
        })
      : [];
  const teacherSubjects = teacherSubjectLinks.map((link) => ({
    classId: link.classId,
    subjectId: link.subjectId,
    subjectName: link.subject.name,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-neutral-900">Exams &amp; Marks</h1>
        <p className="text-xs text-neutral-400">Record and review marks by class and exam.</p>
      </div>
      <MarksView
        exams={exams}
        classes={classes}
        teacherSubjects={teacherSubjects}
        role={claims.role === "teacher" ? "teacher" : "admin"}
      />
    </div>
  );
}
