-- AlterEnum
ALTER TYPE "Gender" ADD VALUE 'other';

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('father', 'mother', 'guardian', 'grandparent', 'sibling', 'other');

-- Converts ParentStudent.relationship from String to the GuardianRelationship
-- enum. Existing values are NOT migrated -- the column is dropped and recreated
-- with the default. No live data as of 2026-08-22. A real migration would map
-- lower(trim(relationship)) onto the enum with a fallback to 'guardian'.
-- AlterTable
ALTER TABLE "ParentStudent" DROP COLUMN "relationship",
ADD COLUMN     "relationship" "GuardianRelationship" NOT NULL DEFAULT 'guardian';
