import type { PrismaClient } from "@prisma/client";

export interface ExamSummary {
  id: number;
  name: string;
  term: string;
  examDate: string;
  academicYearId: number;
  published: boolean;
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
    published: exam.published,
  }));
}

export type SetExamPublishedResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function setExamPublished(
  prisma: PrismaClient,
  params: { examId: number; schoolId: number; published: boolean }
): Promise<SetExamPublishedResult> {
  const exam = await prisma.exam.findFirst({
    where: { id: params.examId, schoolId: params.schoolId },
  });
  if (!exam) return { ok: false, error: "NOT_FOUND" };

  await prisma.exam.update({
    where: { id: params.examId },
    data: { published: params.published },
  });
  return { ok: true };
}

export type CreateExamResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_MAX_MARKS" }
  | { ok: false; error: "INVALID_PASS_MARKS" };

export async function createExam(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    name: string;
    term: string;
    examDate: string;
    maxMarks: number;
    passMarks: number;
    weightage?: number;
  }
): Promise<CreateExamResult> {
  if (input.maxMarks <= 0) return { ok: false, error: "INVALID_MAX_MARKS" };
  if (input.passMarks < 0 || input.passMarks > input.maxMarks) {
    return { ok: false, error: "INVALID_PASS_MARKS" };
  }

  const created = await prisma.exam.create({
    data: {
      schoolId,
      academicYearId,
      name: input.name,
      term: input.term,
      examDate: new Date(input.examDate),
      maxMarks: input.maxMarks,
      passMarks: input.passMarks,
      weightage: input.weightage ?? 1,
    },
  });
  return { ok: true, id: created.id };
}
