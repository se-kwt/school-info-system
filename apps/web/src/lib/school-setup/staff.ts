import type { PrismaClient, Role } from "@prisma/client";
import { isUniqueConstraintViolation } from "./prisma-errors";

export interface StaffSummary {
  id: number;
  name: string;
  phone: string;
  role: Role;
  classAssignment: { className: string; section: string; subject: string } | null;
}

export async function listStaff(prisma: PrismaClient, schoolId: number): Promise<StaffSummary[]> {
  const users = await prisma.user.findMany({
    where: { schoolId, role: { in: ["teacher", "admin", "accountant"] } },
    include: {
      classesTaught: {
        include: { class: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return users.map((user) => {
    const assignment = user.classesTaught[0];
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      classAssignment: assignment
        ? {
            className: assignment.class.name,
            section: assignment.class.section,
            subject: assignment.subject,
          }
        : null,
    };
  });
}

export type CreateStaffResult =
  | { ok: true; staff: { id: number; name: string; phone: string; role: Role } }
  | { ok: false; error: "DUPLICATE_PHONE" }
  | { ok: false; error: "INVALID_CLASS" };

export async function createStaff(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string; phone: string; role: Role; classId?: number; subject?: string }
): Promise<CreateStaffResult> {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    return { ok: false, error: "DUPLICATE_PHONE" };
  }

  if (input.role === "teacher" && input.classId) {
    const targetClass = await prisma.class.findFirst({ where: { id: input.classId, schoolId } });
    if (!targetClass) {
      return { ok: false, error: "INVALID_CLASS" };
    }
  }

  try {
    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { schoolId, name: input.name, phone: input.phone, role: input.role },
      });

      if (input.role === "teacher" && input.classId && input.subject) {
        await tx.classTeacher.create({
          data: { classId: input.classId, teacherUserId: created.id, subject: input.subject },
        });
      }

      return created;
    });

    return {
      ok: true,
      staff: { id: staff.id, name: staff.name, phone: staff.phone, role: staff.role },
    };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { ok: false, error: "DUPLICATE_PHONE" };
    }
    throw err;
  }
}
