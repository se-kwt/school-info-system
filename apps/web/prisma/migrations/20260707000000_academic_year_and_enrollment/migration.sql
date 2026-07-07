-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('upcoming', 'active', 'archived');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('active', 'promoted', 'retained', 'left', 'transferred', 'graduated', 'inactive');

-- CreateEnum
CREATE TYPE "PromotionRunStatus" AS ENUM ('draft', 'confirmed', 'reverted');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('active', 'left', 'transferred', 'graduated', 'inactive');

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_classId_fkey";

-- DropIndex
DROP INDEX "ClassTeacher_classId_teacherUserId_subject_key";

-- DropIndex
DROP INDEX "TimetableEntry_classId_dayOfWeek_period_key";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "classId",
DROP COLUMN "section",
ADD COLUMN "status" "StudentStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "ClassTeacher" ADD COLUMN "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "TimetableEntry" ADD COLUMN "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "FeeStructure" ADD COLUMN "academicYearId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" SERIAL NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'upcoming',

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "rollNumber" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRun" (
    "id" SERIAL NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "fromAcademicYearId" INTEGER NOT NULL,
    "toAcademicYearId" INTEGER NOT NULL,
    "initiatedById" INTEGER NOT NULL,
    "status" "PromotionRunStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "PromotionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionMapping" (
    "id" SERIAL NOT NULL,
    "promotionRunId" INTEGER NOT NULL,
    "fromClassId" INTEGER NOT NULL,
    "toClassId" INTEGER,

    CONSTRAINT "PromotionMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionLogEntry" (
    "id" SERIAL NOT NULL,
    "promotionRunId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "fromClassId" INTEGER NOT NULL,
    "toClassId" INTEGER,
    "action" "EnrollmentStatus" NOT NULL,

    CONSTRAINT "PromotionLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "AcademicYear"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_academicYearId_key" ON "Enrollment"("studentId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionMapping_promotionRunId_fromClassId_key" ON "PromotionMapping"("promotionRunId", "fromClassId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionLogEntry_promotionRunId_studentId_key" ON "PromotionLogEntry"("promotionRunId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassTeacher_classId_teacherUserId_subject_academicYearId_key" ON "ClassTeacher"("classId", "teacherUserId", "subject", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_classId_dayOfWeek_period_academicYearId_key" ON "TimetableEntry"("classId", "dayOfWeek", "period", "academicYearId");

-- AddForeignKey
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRun" ADD CONSTRAINT "PromotionRun_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRun" ADD CONSTRAINT "PromotionRun_fromAcademicYearId_fkey" FOREIGN KEY ("fromAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRun" ADD CONSTRAINT "PromotionRun_toAcademicYearId_fkey" FOREIGN KEY ("toAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRun" ADD CONSTRAINT "PromotionRun_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionMapping" ADD CONSTRAINT "PromotionMapping_promotionRunId_fkey" FOREIGN KEY ("promotionRunId") REFERENCES "PromotionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionMapping" ADD CONSTRAINT "PromotionMapping_fromClassId_fkey" FOREIGN KEY ("fromClassId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionMapping" ADD CONSTRAINT "PromotionMapping_toClassId_fkey" FOREIGN KEY ("toClassId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionLogEntry" ADD CONSTRAINT "PromotionLogEntry_promotionRunId_fkey" FOREIGN KEY ("promotionRunId") REFERENCES "PromotionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionLogEntry" ADD CONSTRAINT "PromotionLogEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
