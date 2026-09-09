-- AlterEnum
ALTER TYPE "Gender" ADD VALUE 'other';

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('father', 'mother', 'guardian', 'grandparent', 'sibling', 'other');

-- Converts ParentStudent.relationship from text to the GuardianRelationship
-- enum, preserving existing values by mapping lower(trim(relationship)) onto
-- the enum with a fallback to 'guardian' for anything that doesn't match.
ALTER TABLE "ParentStudent"
  ALTER COLUMN "relationship" DROP DEFAULT,
  ALTER COLUMN "relationship" TYPE "GuardianRelationship" USING (
    CASE lower(trim("relationship"))
      WHEN 'father' THEN 'father'
      WHEN 'mother' THEN 'mother'
      WHEN 'guardian' THEN 'guardian'
      WHEN 'grandparent' THEN 'grandparent'
      WHEN 'sibling' THEN 'sibling'
      WHEN 'other' THEN 'other'
      ELSE 'guardian'
    END
  )::"GuardianRelationship",
  ALTER COLUMN "relationship" SET DEFAULT 'guardian';
