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

export function computeFeeStatus(amountPaid: number, amount: number): FeeStatus {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid < amount) return "partial";
  return "paid";
}

export type RecordPaymentResult =
  | { ok: true; amountPaid: number; status: FeeStatus }
  | { ok: false; error: "INVALID_FEE_STRUCTURE" }
  | { ok: false; error: "STUDENT_MISMATCH" }
  | { ok: false; error: "INVALID_AMOUNT" }
  | { ok: false; error: "EXCEEDS_AMOUNT_DUE" };

export async function recordPayment(
  prisma: PrismaClient,
  params: {
    feeStructureId: number;
    studentId: number;
    schoolId: number;
    recordedById: number;
    amount: number;
  }
): Promise<RecordPaymentResult> {
  const feeStructure = await prisma.feeStructure.findFirst({
    where: { id: params.feeStructureId, schoolId: params.schoolId },
  });
  if (!feeStructure) {
    return { ok: false, error: "INVALID_FEE_STRUCTURE" };
  }

  const student = await prisma.student.findFirst({
    where: { id: params.studentId, classId: feeStructure.classId },
  });
  if (!student) {
    return { ok: false, error: "STUDENT_MISMATCH" };
  }

  if (params.amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  const existing = await prisma.feePayment.findUnique({
    where: {
      studentId_feeStructureId: {
        studentId: params.studentId,
        feeStructureId: params.feeStructureId,
      },
    },
  });
  const existingAmountPaid = existing ? existing.amountPaid : 0;
  const newAmountPaid = existingAmountPaid + params.amount;

  if (newAmountPaid > feeStructure.amount) {
    return { ok: false, error: "EXCEEDS_AMOUNT_DUE" };
  }

  const status = computeFeeStatus(newAmountPaid, feeStructure.amount);

  await prisma.feePayment.upsert({
    where: {
      studentId_feeStructureId: {
        studentId: params.studentId,
        feeStructureId: params.feeStructureId,
      },
    },
    create: {
      studentId: params.studentId,
      feeStructureId: params.feeStructureId,
      amountPaid: newAmountPaid,
      paidDate: new Date(),
      recordedById: params.recordedById,
      status,
    },
    update: {
      amountPaid: newAmountPaid,
      paidDate: new Date(),
      recordedById: params.recordedById,
      status,
    },
  });

  return { ok: true, amountPaid: newAmountPaid, status };
}
