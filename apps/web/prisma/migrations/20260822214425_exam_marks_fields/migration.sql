/*
  Warnings:

  - Added the required column `maxMarks` to the `Exam` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passMarks` to the `Exam` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "maxMarks" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "passMarks" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "weightage" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Exam_examDate_idx" ON "Exam"("examDate");
