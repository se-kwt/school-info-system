-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "subjectRefId" INTEGER;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "academicYearId" INTEGER,
ADD COLUMN     "gradeId" INTEGER;

-- AlterTable
ALTER TABLE "ClassTeacher" ADD COLUMN     "isClassTeacher" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subjectRefId" INTEGER;

-- AlterTable
ALTER TABLE "Mark" ADD COLUMN     "subjectRefId" INTEGER;

-- AlterTable
ALTER TABLE "TimetableEntry" ADD COLUMN     "periodRefId" INTEGER,
ADD COLUMN     "subjectRefId" INTEGER;

-- CreateTable
CREATE TABLE "Grade" (
    "id" SERIAL NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "gradeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyllabusVersion" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "versionNum" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyllabusVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" SERIAL NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodDayOverride" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "PeriodDayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Grade_schoolId_name_key" ON "Grade"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_gradeId_name_key" ON "Subject"("gradeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SyllabusVersion_subjectId_versionNum_key" ON "SyllabusVersion"("subjectId", "versionNum");

-- CreateIndex
CREATE UNIQUE INDEX "Period_schoolId_order_key" ON "Period"("schoolId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodDayOverride_periodId_dayOfWeek_key" ON "PeriodDayOverride"("periodId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Class_gradeId_section_academicYearId_key" ON "Class"("gradeId", "section", "academicYearId");

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyllabusVersion" ADD CONSTRAINT "SyllabusVersion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyllabusVersion" ADD CONSTRAINT "SyllabusVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Period" ADD CONSTRAINT "Period_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodDayOverride" ADD CONSTRAINT "PeriodDayOverride_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_subjectRefId_fkey" FOREIGN KEY ("subjectRefId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_subjectRefId_fkey" FOREIGN KEY ("subjectRefId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_subjectRefId_fkey" FOREIGN KEY ("subjectRefId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodRefId_fkey" FOREIGN KEY ("periodRefId") REFERENCES "Period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectRefId_fkey" FOREIGN KEY ("subjectRefId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
