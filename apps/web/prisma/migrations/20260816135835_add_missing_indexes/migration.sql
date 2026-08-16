-- CreateIndex
CREATE INDEX "Assignment_classId_idx" ON "Assignment"("classId");

-- CreateIndex
CREATE INDEX "Assignment_subjectId_idx" ON "Assignment"("subjectId");

-- CreateIndex
CREATE INDEX "Assignment_createdById_idx" ON "Assignment"("createdById");

-- CreateIndex
CREATE INDEX "Assignment_academicYearId_idx" ON "Assignment"("academicYearId");

-- CreateIndex
CREATE INDEX "AssignmentStatus_studentId_idx" ON "AssignmentStatus"("studentId");

-- CreateIndex
CREATE INDEX "Attendance_markedById_idx" ON "Attendance"("markedById");

-- CreateIndex
CREATE INDEX "Class_schoolId_idx" ON "Class"("schoolId");

-- CreateIndex
CREATE INDEX "Class_academicYearId_idx" ON "Class"("academicYearId");

-- CreateIndex
CREATE INDEX "ClassTeacher_teacherUserId_idx" ON "ClassTeacher"("teacherUserId");

-- CreateIndex
CREATE INDEX "ClassTeacher_subjectId_idx" ON "ClassTeacher"("subjectId");

-- CreateIndex
CREATE INDEX "ClassTeacher_academicYearId_idx" ON "ClassTeacher"("academicYearId");

-- CreateIndex
CREATE INDEX "Enrollment_academicYearId_idx" ON "Enrollment"("academicYearId");

-- CreateIndex
CREATE INDEX "Exam_schoolId_idx" ON "Exam"("schoolId");

-- CreateIndex
CREATE INDEX "Exam_academicYearId_idx" ON "Exam"("academicYearId");

-- CreateIndex
CREATE INDEX "FeePayment_feeStructureId_idx" ON "FeePayment"("feeStructureId");

-- CreateIndex
CREATE INDEX "FeePayment_recordedById_idx" ON "FeePayment"("recordedById");

-- CreateIndex
CREATE INDEX "FeeStructure_schoolId_idx" ON "FeeStructure"("schoolId");

-- CreateIndex
CREATE INDEX "FeeStructure_classId_idx" ON "FeeStructure"("classId");

-- CreateIndex
CREATE INDEX "FeeStructure_academicYearId_idx" ON "FeeStructure"("academicYearId");

-- CreateIndex
CREATE INDEX "Mark_studentId_idx" ON "Mark"("studentId");

-- CreateIndex
CREATE INDEX "Mark_subjectId_idx" ON "Mark"("subjectId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "OtpCode_phone_idx" ON "OtpCode"("phone");

-- CreateIndex
CREATE INDEX "ParentStudent_studentId_idx" ON "ParentStudent"("studentId");

-- CreateIndex
CREATE INDEX "PromotionLogEntry_studentId_idx" ON "PromotionLogEntry"("studentId");

-- CreateIndex
CREATE INDEX "PromotionMapping_fromClassId_idx" ON "PromotionMapping"("fromClassId");

-- CreateIndex
CREATE INDEX "PromotionMapping_toClassId_idx" ON "PromotionMapping"("toClassId");

-- CreateIndex
CREATE INDEX "PromotionRun_schoolId_idx" ON "PromotionRun"("schoolId");

-- CreateIndex
CREATE INDEX "PromotionRun_fromAcademicYearId_idx" ON "PromotionRun"("fromAcademicYearId");

-- CreateIndex
CREATE INDEX "PromotionRun_toAcademicYearId_idx" ON "PromotionRun"("toAcademicYearId");

-- CreateIndex
CREATE INDEX "PromotionRun_initiatedById_idx" ON "PromotionRun"("initiatedById");

-- CreateIndex
CREATE INDEX "Student_schoolId_idx" ON "Student"("schoolId");

-- CreateIndex
CREATE INDEX "StudentSibling_siblingId_idx" ON "StudentSibling"("siblingId");

-- CreateIndex
CREATE INDEX "SyllabusVersion_createdById_idx" ON "SyllabusVersion"("createdById");

-- CreateIndex
CREATE INDEX "TimetableEntry_periodId_idx" ON "TimetableEntry"("periodId");

-- CreateIndex
CREATE INDEX "TimetableEntry_subjectId_idx" ON "TimetableEntry"("subjectId");

-- CreateIndex
CREATE INDEX "TimetableEntry_teacherUserId_idx" ON "TimetableEntry"("teacherUserId");

-- CreateIndex
CREATE INDEX "TimetableEntry_academicYearId_idx" ON "TimetableEntry"("academicYearId");

-- CreateIndex
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");
