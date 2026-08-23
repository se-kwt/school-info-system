import { Prisma, type PrismaClient } from "@prisma/client";
import { computeFeeStatus, type FeeStatus } from "../fee-payments";
import { toNumber } from "../money";

export interface ParentFeeHistoryEntry {
  id: number;
  term: string;
  className: string;
  academicYearName: string;
  amount: number;
  amountPaid: number;
  status: FeeStatus;
  dueDate: string;
}

export async function getParentFeesHistory(
  prisma: PrismaClient,
  studentId: number
): Promise<ParentFeeHistoryEntry[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    select: { classId: true, academicYearId: true },
  });

  if (enrollments.length === 0) return [];

  const feeStructures = await prisma.feeStructure.findMany({
    where: {
      OR: enrollments.map((enrollment) => ({
        classId: enrollment.classId,
        academicYearId: enrollment.academicYearId,
      })),
    },
    include: {
      class: { include: { grade: true } },
      academicYear: true,
      payments: { where: { studentId } },
    },
    orderBy: { dueDate: "desc" },
  });

  return feeStructures.map((structure) => {
    const amountPaid = structure.payments.reduce(
      (sum, p) => sum.add(p.amountPaid),
      new Prisma.Decimal(0)
    );
    return {
      id: structure.id,
      term: structure.term,
      className: `${structure.class.grade.name} ${structure.class.section}`,
      academicYearName: structure.academicYear.name,
      amount: toNumber(structure.amount),
      amountPaid: toNumber(amountPaid),
      status: computeFeeStatus(amountPaid, structure.amount, structure.dueDate),
      dueDate: structure.dueDate.toISOString().slice(0, 10),
    };
  });
}
