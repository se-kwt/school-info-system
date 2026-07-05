import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function resetDb(): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.feePayment.deleteMany();
  await prisma.feeStructure.deleteMany();
  await prisma.mark.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.assignmentStatus.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.timetableEntry.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.classTeacher.deleteMany();
  await prisma.parentStudent.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();
}
