import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { listSyllabusVersions } from "@/lib/school-setup/subjects";
import { prisma } from "@/lib/prisma";
import { SyllabusHistoryView } from "@/components/school-setup/SyllabusHistoryView";

export default async function SubjectDetailPage(props: { params: Promise<{ gradeId: string; subjectId: string }> }) {
  const params = await props.params;
  const claims = await requireDashboardRole(["admin"]);
  const gradeId = Number(params.gradeId);
  const subjectId = Number(params.subjectId);
  if (Number.isNaN(gradeId) || Number.isNaN(subjectId)) notFound();

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, gradeId, grade: { schoolId: claims.schoolId } },
    include: { grade: true },
  });
  if (!subject) notFound();

  const result = await listSyllabusVersions(prisma, { subjectId, schoolId: claims.schoolId });
  const versions = result.ok ? result.versions : [];

  return (
    <div className="p-6">
      <Link
        href={`/dashboard/subjects/${gradeId}`}
        className="flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {subject.grade.name}
      </Link>
      <h1 className="text-xl font-semibold text-gray-800">{subject.name}</h1>
      <SyllabusHistoryView subjectId={subjectId} subjectName={subject.name} initialVersions={versions} />
    </div>
  );
}
