import { notFound } from "next/navigation";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listSyllabusVersions } from "@/lib/school-setup/subjects";
import { prisma } from "@/lib/prisma";
import { SyllabusHistoryView } from "@/components/school-setup/SyllabusHistoryView";

export default async function SubjectDetailPage(props: { params: Promise<{ id: string; subjectId: string }> }) {
  const params = await props.params;
  const claims = await requireDashboardRole(["admin"]);
  const subjectId = Number(params.subjectId);
  if (Number.isNaN(subjectId)) notFound();

  const subject = await prisma.subject.findFirst({ where: { id: subjectId, grade: { schoolId: claims.schoolId } } });
  if (!subject) notFound();

  const result = await listSyllabusVersions(prisma, { subjectId, schoolId: claims.schoolId });
  const versions = result.ok ? result.versions : [];

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-800">{subject.name}</h1>
      <SyllabusHistoryView subjectId={subjectId} subjectName={subject.name} initialVersions={versions} />
    </div>
  );
}
