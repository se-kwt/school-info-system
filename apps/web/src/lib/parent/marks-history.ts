import type { PrismaClient } from "@prisma/client";
import type { ParentExamSubject } from "./overview";

export interface ParentExamHistoryEntry {
  examId: number;
  examName: string;
  term: string;
  examDate: string;
  subjects: ParentExamSubject[];
}

export async function getParentMarksHistory(
  prisma: PrismaClient,
  studentId: number
): Promise<ParentExamHistoryEntry[]> {
  const marks = await prisma.mark.findMany({
    where: { studentId },
    include: { exam: true },
    orderBy: { exam: { examDate: "desc" } },
  });

  const examsById = new Map<number, ParentExamHistoryEntry>();
  for (const mark of marks) {
    let entry = examsById.get(mark.examId);
    if (!entry) {
      entry = {
        examId: mark.examId,
        examName: mark.exam.name,
        term: mark.exam.term,
        examDate: mark.exam.examDate.toISOString().slice(0, 10),
        subjects: [],
      };
      examsById.set(mark.examId, entry);
    }
    entry.subjects.push({
      subject: mark.subject,
      marksObtained: mark.marksObtained,
      maxMarks: mark.maxMarks,
      grade: mark.grade,
    });
  }

  return Array.from(examsById.values());
}
