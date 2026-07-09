ALTER TABLE "Student" ADD COLUMN "rollNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Student" ADD COLUMN "photoUrl" TEXT;

UPDATE "Student"
SET "rollNumber" = "admissionNo"
WHERE "rollNumber" = '';

ALTER TABLE "Student" ALTER COLUMN "rollNumber" DROP DEFAULT;
