-- This originally shipped with no backfill (all environments were dev/seed
-- only as of 2026-08-22) and failed the first time it ran against production,
-- which by then had real Attendance rows: adding academicYearId NOT NULL in
-- one step leaves existing rows with no value to satisfy the constraint.
-- Fixed here to add the column nullable, backfill from the enrollment whose
-- academic year covers each row's date, then enforce NOT NULL.

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "academicYearId" INTEGER;

-- Backfill existing rows from the enrollment whose academic year's date
-- range covers each row's attendance date.
UPDATE "Attendance" a
SET "academicYearId" = e."academicYearId"
FROM "Enrollment" e
JOIN "AcademicYear" ay ON ay.id = e."academicYearId"
WHERE e."studentId" = a."studentId"
  AND a.date >= ay."startDate"
  AND a.date <= ay."endDate"
  AND a."academicYearId" IS NULL;

ALTER TABLE "Attendance" ALTER COLUMN "academicYearId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Attendance_academicYearId_idx" ON "Attendance"("academicYearId");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
