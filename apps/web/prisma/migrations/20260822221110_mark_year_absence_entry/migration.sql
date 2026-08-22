/*
  Warnings:

  - Added the required column `academicYearId` to the `Mark` table without a default value. This is not possible if the table is not empty.
  - Added the required column `enteredById` to the `Mark` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Mark" ADD COLUMN     "academicYearId" INTEGER NOT NULL,
ADD COLUMN     "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "enteredById" INTEGER NOT NULL,
ADD COLUMN     "gradePoint" DOUBLE PRECISION,
ADD COLUMN     "isAbsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remarks" TEXT;

-- CreateIndex
CREATE INDEX "Mark_academicYearId_idx" ON "Mark"("academicYearId");

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
