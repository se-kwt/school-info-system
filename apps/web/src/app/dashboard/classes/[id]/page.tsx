import { notFound } from "next/navigation";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listSubjects } from "@/lib/school-setup/subjects";
import { listClassFaculty } from "@/lib/school-setup/class-teachers";
import { listStaff } from "@/lib/school-setup/staff";
import { prisma } from "@/lib/prisma";
import { FacultyAssignmentView } from "@/components/school-setup/FacultyAssignmentView";

export default async function ClassDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await requireDashboardRole(["admin"]);
  const classId = Number(params.id);
  if (Number.isNaN(classId)) notFound();

  const klass = await prisma.class.findFirst({
    where: { id: classId, schoolId: claims.schoolId },
    include: { grade: true },
  });
  if (!klass) notFound();

  const [subjectsResult, facultyResult, staff] = await Promise.all([
    listSubjects(prisma, { gradeId: klass.gradeId, schoolId: claims.schoolId }),
    listClassFaculty(prisma, { classId, schoolId: claims.schoolId }),
    listStaff(prisma, claims.schoolId),
  ]);
  const subjects = subjectsResult.ok ? subjectsResult.subjects : [];
  const assignments = facultyResult.ok ? facultyResult.assignments : [];
  const teachers = staff.filter((s) => s.role === "teacher").map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">
        {klass.grade.name} {klass.section} — Faculty
      </h1>
      <FacultyAssignmentView classId={classId} subjects={subjects} teachers={teachers} initialAssignments={assignments} />
    </div>
  );
}
