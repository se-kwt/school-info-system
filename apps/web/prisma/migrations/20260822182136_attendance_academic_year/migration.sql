-- No backfill: all environments are dev/seed only as of 2026-08-22. If this
-- migration is ever run against a database with existing Attendance rows it
-- will fail; the backfill would derive academicYearId from the enrollment
-- covering each row's date.

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "academicYearId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Attendance_academicYearId_idx" ON "Attendance"("academicYearId");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
