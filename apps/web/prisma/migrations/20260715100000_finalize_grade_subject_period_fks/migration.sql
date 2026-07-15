-- Drop old foreign key constraints (reference old *RefId column names)
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_subjectRefId_fkey";
ALTER TABLE "Class" DROP CONSTRAINT "Class_academicYearId_fkey";
ALTER TABLE "Class" DROP CONSTRAINT "Class_gradeId_fkey";
ALTER TABLE "ClassTeacher" DROP CONSTRAINT "ClassTeacher_subjectRefId_fkey";
ALTER TABLE "Mark" DROP CONSTRAINT "Mark_subjectRefId_fkey";
ALTER TABLE "TimetableEntry" DROP CONSTRAINT "TimetableEntry_periodRefId_fkey";
ALTER TABLE "TimetableEntry" DROP CONSTRAINT "TimetableEntry_subjectRefId_fkey";

-- Drop old unique indexes
DROP INDEX "Class_schoolId_name_section_key";
DROP INDEX "ClassTeacher_classId_teacherUserId_subject_academicYearId_key";
DROP INDEX "Mark_examId_studentId_subject_key";
DROP INDEX "TimetableEntry_classId_dayOfWeek_period_academicYearId_key";

-- Rename *RefId → *Id columns (preserves data)
ALTER TABLE "Assignment" RENAME COLUMN "subjectRefId" TO "subjectId";
ALTER TABLE "ClassTeacher" RENAME COLUMN "subjectRefId" TO "subjectId";
ALTER TABLE "Mark" RENAME COLUMN "subjectRefId" TO "subjectId";
ALTER TABLE "TimetableEntry" RENAME COLUMN "subjectRefId" TO "subjectId";
ALTER TABLE "TimetableEntry" RENAME COLUMN "periodRefId" TO "periodId";

-- Make FK columns NOT NULL (Task 2 backfill guarantees all rows are populated)
ALTER TABLE "Assignment" ALTER COLUMN "subjectId" SET NOT NULL;
ALTER TABLE "ClassTeacher" ALTER COLUMN "subjectId" SET NOT NULL;
ALTER TABLE "Mark" ALTER COLUMN "subjectId" SET NOT NULL;
ALTER TABLE "TimetableEntry" ALTER COLUMN "subjectId" SET NOT NULL;
ALTER TABLE "TimetableEntry" ALTER COLUMN "periodId" SET NOT NULL;
ALTER TABLE "Class" ALTER COLUMN "gradeId" SET NOT NULL;
ALTER TABLE "Class" ALTER COLUMN "academicYearId" SET NOT NULL;

-- Drop old scalar free-text / redundant columns
ALTER TABLE "Assignment" DROP COLUMN "subject";
ALTER TABLE "Class" DROP COLUMN "name";
ALTER TABLE "ClassTeacher" DROP COLUMN "subject";
ALTER TABLE "Mark" DROP COLUMN "subject";
ALTER TABLE "TimetableEntry" DROP COLUMN "period";
ALTER TABLE "TimetableEntry" DROP COLUMN "subject";

-- Create new unique indexes
CREATE UNIQUE INDEX "Class_gradeId_section_academicYearId_key" ON "Class"("gradeId", "section", "academicYearId");
CREATE UNIQUE INDEX "ClassTeacher_classId_teacherUserId_subjectId_academicYearId_key" ON "ClassTeacher"("classId", "teacherUserId", "subjectId", "academicYearId");
CREATE UNIQUE INDEX "Mark_examId_studentId_subjectId_key" ON "Mark"("examId", "studentId", "subjectId");
CREATE UNIQUE INDEX "TimetableEntry_classId_dayOfWeek_periodId_academicYearId_key" ON "TimetableEntry"("classId", "dayOfWeek", "periodId", "academicYearId");

-- Add FK constraints with new column names
ALTER TABLE "Class" ADD CONSTRAINT "Class_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Class" ADD CONSTRAINT "Class_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
