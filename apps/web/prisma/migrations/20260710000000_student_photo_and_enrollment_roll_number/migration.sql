-- AlterTable
ALTER TABLE "Student" ADD COLUMN "photoUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_classId_academicYearId_rollNumber_key" ON "Enrollment"("classId", "academicYearId", "rollNumber");
