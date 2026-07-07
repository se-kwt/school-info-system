import type { PrismaClient } from "@prisma/client";

export interface ExamSummary {
  id: number;
  name: string;
  term: string;
  examDate: string;
}

export async function listExams(prisma: PrismaClient, schoolId: number): Promise<ExamSummary[]> {
  const exams = await prisma.exam.findMany({
    where: { schoolId },
    orderBy: { examDate: "desc" },
  });
  return exams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    term: exam.term,
    examDate: exam.examDate.toISOString().slice(0, 10),
  }));
}

export async function createExam(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: { name: string; term: string; examDate: string }
): Promise<{ id: number }> {
  const created = await prisma.exam.create({
    data: {
      schoolId,
      academicYearId,
      name: input.name,
      term: input.term,
      examDate: new Date(input.examDate),
    },
  });
  return { id: created.id };
}
