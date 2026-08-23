import type { PrismaClient } from "@prisma/client";
import { toNumber } from "./money";

export interface FeeStructureSummary {
  id: number;
  term: string;
  amount: number;
  dueDate: string;
}

export type ListFeeStructuresResult =
  | { ok: true; feeStructures: FeeStructureSummary[] }
  | { ok: false; error: "INVALID_CLASS" };

export async function listFeeStructures(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; academicYearId: number }
): Promise<ListFeeStructuresResult> {
  const klass = await prisma.class.findFirst({
    where: { id: params.classId, schoolId: params.schoolId, academicYearId: params.academicYearId },
  });
  if (!klass) return { ok: false, error: "INVALID_CLASS" };

  const feeStructures = await prisma.feeStructure.findMany({
    where: { classId: params.classId, academicYearId: params.academicYearId },
    orderBy: { dueDate: "desc" },
  });

  return {
    ok: true,
    feeStructures: feeStructures.map((fs) => ({
      id: fs.id,
      term: fs.term,
      amount: toNumber(fs.amount),
      dueDate: fs.dueDate.toISOString().slice(0, 10),
    })),
  };
}

export type CreateFeeStructureResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_CLASS" };

export async function createFeeStructure(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    classId: number;
    term: string;
    amount: number;
    dueDate: string;
    discount?: number;
    fineAmount?: number;
  }
): Promise<CreateFeeStructureResult> {
  const klass = await prisma.class.findFirst({
    where: { id: input.classId, schoolId, academicYearId },
  });
  if (!klass) return { ok: false, error: "INVALID_CLASS" };

  const created = await prisma.feeStructure.create({
    data: {
      schoolId,
      academicYearId,
      classId: input.classId,
      term: input.term,
      amount: input.amount,
      discount: input.discount ?? 0,
      fineAmount: input.fineAmount ?? 0,
      dueDate: new Date(input.dueDate),
    },
  });
  return { ok: true, id: created.id };
}
