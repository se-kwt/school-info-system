import { notFound } from "next/navigation";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listSubjects } from "@/lib/school-setup/subjects";
import { prisma } from "@/lib/prisma";
import { GradeDetailView } from "@/components/school-setup/GradeDetailView";

export default async function GradeDetailPage({ params }: { params: { id: string } }) {
  const claims = requireDashboardRole(["admin"]);
  const gradeId = Number(params.id);
  if (Number.isNaN(gradeId)) notFound();

  const grade = await prisma.grade.findFirst({ where: { id: gradeId, schoolId: claims.schoolId } });
  if (!grade) notFound();

  const result = await listSubjects(prisma, { gradeId, schoolId: claims.schoolId });
  const subjects = result.ok ? result.subjects : [];

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">{grade.name}</h1>
      <GradeDetailView gradeId={gradeId} gradeName={grade.name} initialSubjects={subjects} />
    </div>
  );
}
