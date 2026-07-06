import type { PrismaClient, FeeStatus } from "@prisma/client";

export interface FeeRosterEntry {
  studentId: number;
  name: string;
  amountPaid: number;
  amount: number;
  status: FeeStatus;
}

export type GetFeeRosterResult =
  | { ok: true; students: FeeRosterEntry[] }
  | { ok: false; error: "INVALID_FEE_STRUCTURE" };

export async function getFeeRoster(
  prisma: PrismaClient,
  params: { feeStructureId: number; schoolId: number }
): Promise<GetFeeRosterResult> {
  const feeStructure = await prisma.feeStructure.findFirst({
    where: { id: params.feeStructureId, schoolId: params.schoolId },
  });
  if (!feeStructure) {
    return { ok: false, error: "INVALID_FEE_STRUCTURE" };
  }

  const students = await prisma.student.findMany({
    where: { classId: feeStructure.classId },
    orderBy: { name: "asc" },
  });

  const payments = await prisma.feePayment.findMany({
    where: {
      feeStructureId: params.feeStructureId,
      studentId: { in: students.map((student) => student.id) },
    },
  });

  const result: FeeRosterEntry[] = students.map((student) => {
    const payment = payments.find((p) => p.studentId === student.id);
    return {
      studentId: student.id,
      name: student.name,
      amountPaid: payment ? payment.amountPaid : 0,
      amount: feeStructure.amount,
      status: payment ? payment.status : "unpaid",
    };
  });

  return { ok: true, students: result };
}
