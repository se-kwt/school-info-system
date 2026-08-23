-- Requires distinct sortOrder per school. Existing grades all default to 0, so
-- this migration fails on any school with 2+ grades. No live data as of
-- 2026-08-22; run `prisma migrate reset` and reseed. A real backfill would
-- assign sortOrder by parsing the numeric part of each grade name.

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Grade_schoolId_sortOrder_key" ON "Grade"("schoolId", "sortOrder");
