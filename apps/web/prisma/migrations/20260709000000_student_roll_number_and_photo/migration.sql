/*
  Warnings:

  - A unique constraint covering the columns `[classId,rollNumber]` on the table `Student` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `rollNumber` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "rollNumber" TEXT;

-- Backfill existing rows so the column can become NOT NULL without data loss.
UPDATE "Student" SET "rollNumber" = "admissionNo" WHERE "rollNumber" IS NULL;

-- AlterTable
ALTER TABLE "Student" ALTER COLUMN "rollNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Student_classId_rollNumber_key" ON "Student"("classId", "rollNumber");
