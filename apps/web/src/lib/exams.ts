import type { PrismaClient } from "@prisma/client";

export interface ExamSummary {
  id: number;
  name: string;
  term: string;
  examDate: string;
  academicYearId: number;
}

export async function listExams(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number
): Promise<ExamSummary[]> {
  const exams = await prisma.exam.findMany({
    where: { schoolId, academicYearId },
    orderBy: { examDate: "desc" },
  });
  return exams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    term: exam.term,
    examDate: exam.examDate.toISOString().slice(0, 10),
    academicYearId: exam.academicYearId,
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
