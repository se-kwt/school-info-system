-- DropIndex: remove premature unique constraint from Class (will be added back in Task 3 post-backfill)
DROP INDEX "Class_gradeId_section_academicYearId_key";

-- AlterTable: change PeriodDayOverride FK to use ON DELETE CASCADE
ALTER TABLE "PeriodDayOverride" DROP CONSTRAINT "PeriodDayOverride_periodId_fkey";

ALTER TABLE "PeriodDayOverride" ADD CONSTRAINT "PeriodDayOverride_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE;
