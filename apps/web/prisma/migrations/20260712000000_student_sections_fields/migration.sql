-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- AlterTable: Add email to User
ALTER TABLE "User" ADD COLUMN "email" TEXT;

-- AlterTable: Add new columns to Student
ALTER TABLE "Student" ADD COLUMN "gender" "Gender",
ADD COLUMN "studentIdNumber" TEXT,
ADD COLUMN "dateOfJoin" TIMESTAMP(3);

-- AlterTable: Add relationship to ParentStudent
ALTER TABLE "ParentStudent" ADD COLUMN "relationship" TEXT NOT NULL DEFAULT 'Guardian';

-- CreateTable: StudentSibling
CREATE TABLE "StudentSibling" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "siblingId" INTEGER NOT NULL,

    CONSTRAINT "StudentSibling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentIdNumber_key" ON "Student"("studentIdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSibling_studentId_siblingId_key" ON "StudentSibling"("studentId", "siblingId");

-- AddForeignKey
ALTER TABLE "StudentSibling" ADD CONSTRAINT "StudentSibling_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSibling" ADD CONSTRAINT "StudentSibling_siblingId_fkey" FOREIGN KEY ("siblingId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
