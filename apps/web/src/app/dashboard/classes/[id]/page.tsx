import { notFound } from "next/navigation";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listStudents } from "@/lib/school-setup/students";
import { prisma } from "@/lib/prisma";
import { StudentsView } from "@/components/school-setup/StudentsView";

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

  const students = await listStudents(prisma, claims.schoolId, { classId });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">
        {klass.grade.name} {klass.section} — Students
      </h1>
      <StudentsView
        initialStudents={students}
        classes={[{ id: klass.id, gradeName: klass.grade.name, section: klass.section }]}
        isAdmin={true}
        hideClassFilter
      />
    </div>
  );
}
