import type { PrismaClient } from "@prisma/client";

export interface ParentFeeHistoryEntry {
  id: number;
  term: string;
  className: string;
  academicYearName: string;
  amount: number;
  amountPaid: number;
  status: "paid" | "partial" | "unpaid";
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
      class: true,
      academicYear: true,
      payments: { where: { studentId } },
    },
    orderBy: { dueDate: "desc" },
  });

  return feeStructures.map((structure) => {
    const payment = structure.payments[0];
    return {
      id: structure.id,
      term: structure.term,
      className: `${structure.class.name} ${structure.class.section}`,
      academicYearName: structure.academicYear.name,
      amount: structure.amount,
      amountPaid: payment?.amountPaid ?? 0,
      status: payment?.status ?? "unpaid",
      dueDate: structure.dueDate.toISOString().slice(0, 10),
    };
  });
}
