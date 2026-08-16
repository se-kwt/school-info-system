/*
  Warnings:

  - A unique constraint covering the columns `[teacherUserId,dayOfWeek,periodId,academicYearId]` on the table `TimetableEntry` will be added. If there are existing duplicate values, this will fail.

*/

-- WARNING: this migration will FAIL if any existing rows already violate the
-- new uniqueness constraint (i.e., the same teacher was already double-booked
-- before this fix existed). Before deploying to a database with existing
-- timetable data, run this diagnostic query to check for violations:
--
--   SELECT "teacherUserId", "dayOfWeek", "periodId", "academicYearId", COUNT(*)
--   FROM "TimetableEntry"
--   WHERE "teacherUserId" IS NOT NULL
--   GROUP BY "teacherUserId", "dayOfWeek", "periodId", "academicYearId"
--   HAVING COUNT(*) > 1;
--
-- If this returns any rows, resolve them manually (reassign or clear the
-- teacherUserId on the duplicate entries) before running this migration.

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_teacherUserId_dayOfWeek_periodId_academicYea_key" ON "TimetableEntry"("teacherUserId", "dayOfWeek", "periodId", "academicYearId");
