import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listSubjects } from "@/lib/school-setup/subjects";
import { listClassFaculty } from "@/lib/school-setup/class-teachers";
import { listStaff } from "@/lib/school-setup/staff";
import { prisma } from "@/lib/prisma";
import { FacultyAssignmentView } from "@/components/school-setup/FacultyAssignmentView";

export default async function FacultyAssignmentDetailPage(props: { params: Promise<{ classId: string }> }) {
  const params = await props.params;
  const claims = await requireDashboardRole(["admin"]);
  const classId = Number(params.classId);
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
  const teachers = staff
    .filter((s) => s.role === "teacher" && s.status === "active")
    .map((s) => ({ id: s.id, name: s.name, status: s.status }));

  return (
    <div className="p-6">
      <Link
        href="/dashboard/faculty-assignment"
        className="flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Faculty Assignment
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-gray-800">
        {klass.grade.name} {klass.section} — Faculty
      </h1>
      <FacultyAssignmentView classId={classId} subjects={subjects} teachers={teachers} initialAssignments={assignments} />
    </div>
  );
}
