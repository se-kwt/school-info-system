-- Enforce at most one active academic year per school.
--
-- Prisma 5.20 cannot express a partial unique index in the schema DSL, so this
-- index is created by hand and does NOT appear in prisma/schema.prisma.
--
-- CONSEQUENCE: `prisma migrate dev` diffs the replayed migration history against
-- schema.prisma. Because it sees an index the schema does not declare, it will
-- emit a `DROP INDEX "AcademicYear_schoolId_active_key"` line into the NEXT
-- generated migration. Read every generated migration before applying it and
-- delete that line if present.
--
-- WARNING: this migration will FAIL if any school already has two or more
-- academic years with status = 'active'. Diagnostic:
--
--   SELECT "schoolId", COUNT(*) FROM "AcademicYear"
--   WHERE status = 'active' GROUP BY "schoolId" HAVING COUNT(*) > 1;
--
-- Resolve by archiving the duplicates before migrating.

CREATE UNIQUE INDEX "AcademicYear_schoolId_active_key"
  ON "AcademicYear"("schoolId")
  WHERE status = 'active';
