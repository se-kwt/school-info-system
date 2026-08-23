import { Prisma, type PaymentMode, type PrismaClient } from "@prisma/client";
import { getEnrolledStudents } from "./enrollment";
import { toNumber } from "./money";

// `FeeStatus` used to be a stored enum column on `FeePayment`. Status is now
// derived from the ledger (see `computeFeeStatus`) rather than persisted, so
// this is a plain TS union rather than a Prisma-generated enum type.
export type FeeStatus = "paid" | "partial" | "unpaid" | "overdue";

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

  const payments = await prisma.feePayment.groupBy({
    by: ["studentId"],
    where: {
      feeStructureId: params.feeStructureId,
      studentId: { in: enrolled.map((student) => student.id) },
    },
    _sum: { amountPaid: true },
  });
  const paidByStudent = new Map(
    payments.map((p) => [p.studentId, p._sum.amountPaid ?? new Prisma.Decimal(0)])
  );

  const now = new Date();
  const netDue = netAmountDue(feeStructure, now);

  return {
    ok: true,
    students: enrolled.map((student) => {
      const amountPaid = paidByStudent.get(student.id) ?? new Prisma.Decimal(0);
      return {
        studentId: student.id,
        name: student.name,
        amountPaid: toNumber(amountPaid),
        amount: toNumber(netDue),
        status: computeFeeStatus(amountPaid, netDue, feeStructure.dueDate, now),
      };
    }),
  };
}

export function netAmountDue(
  feeStructure: {
    amount: Prisma.Decimal;
    discount: Prisma.Decimal;
    fineAmount: Prisma.Decimal;
    dueDate: Date;
  },
  now: Date = new Date()
): Prisma.Decimal {
  const base = feeStructure.amount.minus(feeStructure.discount);
  return now > feeStructure.dueDate ? base.add(feeStructure.fineAmount) : base;
}

export function computeFeeStatus(
  amountPaid: Prisma.Decimal,
  amount: Prisma.Decimal,
  dueDate: Date,
  now: Date = new Date()
): FeeStatus {
  if (amountPaid.greaterThanOrEqualTo(amount)) return "paid";
  if (now > dueDate) return "overdue";
  if (amountPaid.lessThanOrEqualTo(0)) return "unpaid";
  return "partial";
}

async function sumPaid(
  prisma: PrismaClient,
  params: { studentId: number; feeStructureId: number }
): Promise<Prisma.Decimal> {
  const result = await prisma.feePayment.aggregate({
    where: { studentId: params.studentId, feeStructureId: params.feeStructureId },
    _sum: { amountPaid: true },
  });
  return result._sum.amountPaid ?? new Prisma.Decimal(0);
}

export type RecordPaymentResult =
  | { ok: true; amountPaid: number; status: FeeStatus; receiptNo: string }
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
    mode: PaymentMode;
    reference?: string;
  }
): Promise<RecordPaymentResult> {
  // NOTE: early returns below still COMMIT the transaction (Prisma only rolls back
  // on a thrown error). Every early return here sits BEFORE the single create at the
  // end of the body, so committing an empty transaction is harmless. Any future write
  // added above an early return breaks that and must be reordered or made to throw.
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

      const priorTotal = await sumPaid(tx as PrismaClient, {
        studentId: params.studentId,
        feeStructureId: params.feeStructureId,
      });
      const newAmountPaid = priorTotal.add(new Prisma.Decimal(params.amount));

      const now = new Date();
      const netDue = netAmountDue(feeStructure, now);

      if (newAmountPaid.greaterThan(netDue)) {
        return { ok: false, error: "EXCEEDS_AMOUNT_DUE" };
      }

      const priorCount = await tx.feePayment.count({
        where: { feeStructureId: params.feeStructureId },
      });
      const receiptNo = `R-${params.feeStructureId}-${String(priorCount + 1).padStart(5, "0")}`;

      await tx.feePayment.create({
        data: {
          studentId: params.studentId,
          feeStructureId: params.feeStructureId,
          amountPaid: params.amount,
          paidDate: new Date(),
          mode: params.mode,
          receiptNo,
          reference: params.reference ?? null,
          recordedById: params.recordedById,
        },
      });

      return {
        ok: true,
        amountPaid: toNumber(newAmountPaid),
        status: computeFeeStatus(newAmountPaid, netDue, feeStructure.dueDate, now),
        receiptNo,
      };
    },
    { isolationLevel: "Serializable" }
  );
}

export interface PaymentHistoryEntry {
  id: number;
  amountPaid: number;
  paidDate: string;
  mode: PaymentMode;
  receiptNo: string;
  reference: string | null;
  recordedByName: string;
}

export type ListPaymentsResult =
  | { ok: true; payments: PaymentHistoryEntry[] }
  | { ok: false; error: "INVALID_FEE_STRUCTURE" };

export async function listPaymentsForStudent(
  prisma: PrismaClient,
  params: { studentId: number; feeStructureId: number; schoolId: number }
): Promise<ListPaymentsResult> {
  const feeStructure = await prisma.feeStructure.findFirst({
    where: { id: params.feeStructureId, schoolId: params.schoolId },
  });
  if (!feeStructure) return { ok: false, error: "INVALID_FEE_STRUCTURE" };

  const payments = await prisma.feePayment.findMany({
    where: { studentId: params.studentId, feeStructureId: params.feeStructureId },
    include: { recordedBy: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    ok: true,
    payments: payments.map((p) => ({
      id: p.id,
      amountPaid: toNumber(p.amountPaid),
      paidDate: p.paidDate.toISOString().slice(0, 10),
      mode: p.mode,
      receiptNo: p.receiptNo,
      reference: p.reference,
      recordedByName: p.recordedBy.name,
    })),
  };
}
