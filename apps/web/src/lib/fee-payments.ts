import type { FeeStatus, PrismaClient } from "@prisma/client";
import { getEnrolledStudents } from "./enrollment";

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
  if (!feeStructure) return { ok: false, error: "INVALID_FEE_STRUCTURE" };

  const enrolled = await getEnrolledStudents(prisma, {
    classId: feeStructure.classId,
    academicYearId: feeStructure.academicYearId,
  });
  const payments = await prisma.feePayment.findMany({
    where: {
      feeStructureId: params.feeStructureId,
      studentId: { in: enrolled.map((student) => student.id) },
    },
  });

  return {
    ok: true,
    students: enrolled.map((student) => {
      const payment = payments.find((p) => p.studentId === student.id);
      return {
        studentId: student.id,
        name: student.name,
        amountPaid: payment ? payment.amountPaid : 0,
        amount: feeStructure.amount,
        status: payment ? payment.status : "unpaid",
      };
    }),
  };
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
  // NOTE: early returns below still COMMIT the transaction (Prisma only rolls back on a thrown
  // error) -- safe today because nothing has written yet at those points, but any future write
  // added above an early-return branch must account for this.
  return prisma.$transaction(
    async (tx) => {
      const feeStructure = await tx.feeStructure.findFirst({
        where: { id: params.feeStructureId, schoolId: params.schoolId },
      });
      if (!feeStructure) return { ok: false, error: "INVALID_FEE_STRUCTURE" };

      const enrollment = await tx.enrollment.findFirst({
        where: {
          studentId: params.studentId,
          classId: feeStructure.classId,
          academicYearId: feeStructure.academicYearId,
          status: "active",
        },
      });
      if (!enrollment) return { ok: false, error: "STUDENT_MISMATCH" };
      if (params.amount <= 0) return { ok: false, error: "INVALID_AMOUNT" };

      const existing = await tx.feePayment.findUnique({
        where: {
          studentId_feeStructureId: { studentId: params.studentId, feeStructureId: params.feeStructureId },
        },
      });
      const existingAmountPaid = existing ? existing.amountPaid : 0;
      const newAmountPaid = existingAmountPaid + params.amount;

      if (newAmountPaid > feeStructure.amount) return { ok: false, error: "EXCEEDS_AMOUNT_DUE" };

      const status = computeFeeStatus(newAmountPaid, feeStructure.amount);
      await tx.feePayment.upsert({
        where: {
          studentId_feeStructureId: { studentId: params.studentId, feeStructureId: params.feeStructureId },
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
    },
    { isolationLevel: "Serializable" }
  );
}
