/*
  Warnings:

  - Added the required column `maxMarks` to the `Exam` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passMarks` to the `Exam` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "maxMarks" DOUBLE PRECISION,
ADD COLUMN     "passMarks" DOUBLE PRECISION,
ADD COLUMN     "weightage" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Backfill existing exams with commonly-used defaults (max 100, pass 35);
-- admins can adjust per-exam afterward.
UPDATE "Exam" SET "maxMarks" = 100, "passMarks" = 35 WHERE "maxMarks" IS NULL;

ALTER TABLE "Exam" ALTER COLUMN "maxMarks" SET NOT NULL;
ALTER TABLE "Exam" ALTER COLUMN "passMarks" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Exam_examDate_idx" ON "Exam"("examDate");
