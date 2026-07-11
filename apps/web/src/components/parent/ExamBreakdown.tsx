import type { ParentExamSubject } from "@/lib/parent/overview";

export function ExamBreakdown({
  examName,
  subjects,
}: {
  examName: string;
  subjects: ParentExamSubject[];
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-neutral-800">{examName}</p>
      <ul className="space-y-1">
        {subjects.map((subject) => (
          <li key={subject.subject} className="text-[11px] font-semibold text-neutral-400">
            {subject.subject}: {subject.marksObtained}/{subject.maxMarks} ({subject.grade})
          </li>
        ))}
      </ul>
    </div>
  );
}
