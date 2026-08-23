-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "gradedScore" DOUBLE PRECISION,
ADD COLUMN     "maxMarks" DOUBLE PRECISION,
ADD COLUMN     "submissionName" TEXT,
ADD COLUMN     "submissionUrl" TEXT;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "room" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'in_app',
ADD COLUMN     "deliveryStatus" TEXT NOT NULL DEFAULT 'created';

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "principalName" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "code" TEXT,
ADD COLUMN     "creditHours" DOUBLE PRECISION,
ADD COLUMN     "isElective" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPractical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyPeriods" INTEGER;

-- AlterTable
ALTER TABLE "SyllabusVersion" ADD COLUMN     "effectiveFrom" TIMESTAMP(3),
ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT false;
