import type { PrismaClient } from "@prisma/client";

export interface StudentSummary {
  id: number;
  name: string;
  admissionNo: string;
  class: { name: string; section: string };
  parents: { name: string; phone: string }[];
}

export async function listStudents(prisma: PrismaClient, schoolId: number): Promise<StudentSummary[]> {
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      class: true,
      parentLinks: { include: { parent: true } },
    },
    orderBy: { name: "asc" },
  });

  return students.map((student) => ({
    id: student.id,
    name: student.name,
    admissionNo: student.admissionNo,
    class: { name: student.class.name, section: student.class.section },
    parents: student.parentLinks.map((link) => ({
      name: link.parent.name,
      phone: link.parent.phone,
    })),
  }));
}

export type CreateStudentResult =
  | { ok: true; student: { id: number; name: string; admissionNo: string } }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PARENT_NAME_REQUIRED" };

export async function createStudent(
  prisma: PrismaClient,
  schoolId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    parentPhone: string;
    parentName?: string;
  }
): Promise<CreateStudentResult> {
  const existingAdmission = await prisma.student.findUnique({
    where: { admissionNo: input.admissionNo },
  });
  if (existingAdmission) {
    return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
  }

  const existingParent = await prisma.user.findUnique({ where: { phone: input.parentPhone } });
  if (existingParent && existingParent.role !== "parent") {
    return { ok: false, error: "PHONE_WRONG_ROLE" };
  }
  if (!existingParent && !input.parentName) {
    return { ok: false, error: "PARENT_NAME_REQUIRED" };
  }

  const targetClass = await prisma.class.findUniqueOrThrow({ where: { id: input.classId } });

  const student = await prisma.$transaction(async (tx) => {
    const parent =
      existingParent ??
      (await tx.user.create({
        data: { schoolId, phone: input.parentPhone, name: input.parentName as string, role: "parent" },
      }));

    const createdStudent = await tx.student.create({
      data: {
        schoolId,
        name: input.name,
        dob: new Date(input.dob),
        classId: input.classId,
        section: targetClass.section,
        admissionNo: input.admissionNo,
      },
    });

    await tx.parentStudent.create({
      data: { parentUserId: parent.id, studentId: createdStudent.id },
    });

    return createdStudent;
  });

  return {
    ok: true,
    student: { id: student.id, name: student.name, admissionNo: student.admissionNo },
  };
}
