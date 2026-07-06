/*
  Warnings:

  - A unique constraint covering the columns `[studentId,feeStructureId]` on the table `FeePayment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "FeePayment_studentId_feeStructureId_key" ON "FeePayment"("studentId", "feeStructureId");
