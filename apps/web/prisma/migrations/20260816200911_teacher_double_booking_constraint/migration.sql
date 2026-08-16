/*
  Warnings:

  - A unique constraint covering the columns `[teacherUserId,dayOfWeek,periodId,academicYearId]` on the table `TimetableEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_teacherUserId_dayOfWeek_periodId_academicYearId_key" ON "TimetableEntry"("teacherUserId", "dayOfWeek", "periodId", "academicYearId");
