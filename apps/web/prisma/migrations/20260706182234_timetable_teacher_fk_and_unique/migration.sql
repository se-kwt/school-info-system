/*
  Warnings:

  - A unique constraint covering the columns `[classId,dayOfWeek,period]` on the table `TimetableEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "TimetableEntry" ALTER COLUMN "teacherUserId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_classId_dayOfWeek_period_key" ON "TimetableEntry"("classId", "dayOfWeek", "period");

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
