-- Requires distinct sortOrder per school. Backfilled below by parsing the
-- trailing number out of each grade's name (e.g. "Grade 7" -> 7) before the
-- unique index is created, so schools with multiple existing grades don't
-- collide on the column's default value of 0.

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: parse the trailing number out of each grade's name.
UPDATE "Grade"
SET "sortOrder" = (regexp_match(name, '(\d+)\s*$'))[1]::int
WHERE (regexp_match(name, '(\d+)\s*$')) IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Grade_schoolId_sortOrder_key" ON "Grade"("schoolId", "sortOrder");
