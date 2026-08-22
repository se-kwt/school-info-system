-- Destructive by design: drops the one-row-per-student-per-fee unique constraint
-- and the derived `status` column. No backfill — all environments are dev/seed
-- only as of 2026-08-22. Against real data this would need each existing row
-- split into a single seed ledger entry before the constraint is dropped.

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('cash', 'cheque', 'card', 'bank_transfer', 'upi', 'other');

-- DropIndex
DROP INDEX "FeePayment_studentId_feeStructureId_key";

-- AlterTable
ALTER TABLE "FeePayment" DROP COLUMN "status",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mode" "PaymentMode" NOT NULL,
ADD COLUMN     "receiptNo" TEXT NOT NULL,
ADD COLUMN     "reference" TEXT,
ALTER COLUMN "paidDate" SET NOT NULL;

-- CreateIndex
CREATE INDEX "FeePayment_studentId_feeStructureId_idx" ON "FeePayment"("studentId", "feeStructureId");

-- CreateIndex
CREATE INDEX "FeePayment_paidDate_idx" ON "FeePayment"("paidDate");

-- CreateIndex
CREATE UNIQUE INDEX "FeePayment_feeStructureId_receiptNo_key" ON "FeePayment"("feeStructureId", "receiptNo");
