import type { GuardianRelationship, PrismaClient, StudentStatus } from "@prisma/client";
import { isUniqueConstraintViolation, uniqueConstraintTarget } from "./prisma-errors";
import { isValidPhone, normalizePhone } from "../phone";

export interface StudentSummary {
  id: number;
  name: string;
  dob: string;
  admissionNo: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: StudentStatus;
  gender: "male" | "female" | "other" | null;
  studentIdNumber: string | null;
  dateOfJoin: string | null;
  address: string | null;
  bloodGroup: string | null;
  nationality: string | null;
  religion: string | null;
  previousSchool: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  category: string | null;
  admissionDate: string | null;
  class: { gradeName: string; section: string } | null;
  parents: { relationship: GuardianRelationship; name: string; phone: string; email: string | null }[];
  siblings: { id: number; name: string; admissionNo: string; gender: "male" | "female" | "other" | null; class: { gradeName: string; section: string } | null }[];
}

export async function listStudents(
  prisma: PrismaClient,
  schoolId: number,
  options?: { page?: number; pageSize?: number }
): Promise<StudentSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      parentLinks: { include: { parent: true } },
      enrollments: {
        where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
        include: { class: { include: { grade: true } } },
      },
    },
    orderBy: { name: "asc" },
    ...(options?.page && options?.pageSize
      ? { skip: (options.page - 1) * options.pageSize, take: options.pageSize }
      : {}),
  });

  const studentIds = students.map((s) => s.id);
  const byId = new Map(students.map((s) => [s.id, s]));
  const siblingLinks = await prisma.studentSibling.findMany({
    where: { OR: [{ studentId: { in: studentIds } }, { siblingId: { in: studentIds } }] },
  });

  // Sibling ids referenced by this page's students may fall on a different
  // page (or be excluded from the current page's `where`/`skip`/`take`
  // entirely), so fetch their summary data separately, unpaginated, rather
  // than looking them up in the page-scoped `byId` map.
  const referencedSiblingIds = new Set<number>();
  for (const link of siblingLinks) {
    if (byId.has(link.studentId)) referencedSiblingIds.add(link.siblingId);
    if (byId.has(link.siblingId)) referencedSiblingIds.add(link.studentId);
  }
  const missingSiblingIds = [...referencedSiblingIds].filter((id) => !byId.has(id));

  type StudentRow = (typeof students)[number];
  const extraSiblingRows: StudentRow[] =
    missingSiblingIds.length > 0
      ? await prisma.student.findMany({
          where: { id: { in: missingSiblingIds } },
          include: {
            parentLinks: { include: { parent: true } },
            enrollments: {
              where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
              include: { class: { include: { grade: true } } },
            },
          },
        })
      : [];

  const siblingSummaryById = new Map<number, StudentRow>(byId);
  for (const row of extraSiblingRows) {
    siblingSummaryById.set(row.id, row);
  }

  function siblingSummary(id: number) {
    const s = siblingSummaryById.get(id);
    if (!s) return null;
    const enrollment = s.enrollments[0];
    return {
      id: s.id,
      name: s.name,
      admissionNo: s.admissionNo,
      gender: s.gender,
      class: enrollment ? { gradeName: enrollment.class.grade.name, section: enrollment.class.section } : null,
    };
  }

  const siblingsByStudent = new Map<number, ReturnType<typeof siblingSummary>[]>();
  function addSibling(ownerId: number, otherId: number) {
    if (!byId.has(ownerId)) return;
    const summary = siblingSummary(otherId);
    if (!summary) return;
    const list = siblingsByStudent.get(ownerId) ?? [];
    list.push(summary);
    siblingsByStudent.set(ownerId, list);
  }
  for (const link of siblingLinks) {
    addSibling(link.studentId, link.siblingId);
    addSibling(link.siblingId, link.studentId);
  }

  return students.map((student) => {
    const enrollment = student.enrollments[0];
    return {
      id: student.id,
      name: student.name,
      dob: student.dob.toISOString().slice(0, 10),
      admissionNo: student.admissionNo,
      rollNumber: enrollment?.rollNumber ?? null,
      photoUrl: student.photoUrl,
      status: student.status,
      gender: student.gender,
      studentIdNumber: student.studentIdNumber,
      dateOfJoin: student.dateOfJoin ? student.dateOfJoin.toISOString().slice(0, 10) : null,
      address: student.address,
      bloodGroup: student.bloodGroup,
      nationality: student.nationality,
      religion: student.religion,
      previousSchool: student.previousSchool,
      emergencyContactName: student.emergencyContactName,
      emergencyContactPhone: student.emergencyContactPhone,
      category: student.category,
      admissionDate: student.admissionDate ? student.admissionDate.toISOString().slice(0, 10) : null,
      class: enrollment ? { gradeName: enrollment.class.grade.name, section: enrollment.class.section } : null,
      parents: student.parentLinks.map((link) => ({
        relationship: link.relationship,
        name: link.parent.name,
        phone: link.parent.phone,
        email: link.parent.email,
      })),
      siblings: (siblingsByStudent.get(student.id) ?? []).filter((s): s is NonNullable<typeof s> => s !== null),
    };
  });
}

export type CreateStudentResult =
  | { ok: true; student: { id: number; name: string; admissionNo: string } }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "DUPLICATE_STUDENT_ID" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" }
  | { ok: false; error: "INVALID_PHONE" }
  | { ok: false; error: "PARENT_REQUIRED" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SIBLING" }
  | { ok: false; error: "CLASS_FULL" };

export async function createStudent(
  prisma: PrismaClient,
  schoolId: number,
  academicYearId: number,
  input: {
    name: string;
    dob: string;
    classId: number;
    admissionNo: string;
    rollNumber?: string;
    photoUrl?: string;
    gender?: "male" | "female" | "other";
    studentIdNumber?: string;
    dateOfJoin?: string;
    address?: string;
    bloodGroup?: string;
    nationality?: string;
    religion?: string;
    previousSchool?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    category?: string;
    admissionDate?: string;
    parents: { relationship: GuardianRelationship; name: string; phone: string; email?: string }[];
    siblingStudentIds?: number[];
  }
): Promise<CreateStudentResult> {
  const existingAdmission = await prisma.student.findUnique({ where: { admissionNo: input.admissionNo } });
  if (existingAdmission) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };

  if (input.studentIdNumber) {
    const existingStudentId = await prisma.student.findUnique({ where: { studentIdNumber: input.studentIdNumber } });
    if (existingStudentId) return { ok: false, error: "DUPLICATE_STUDENT_ID" };
  }

  if (input.rollNumber) {
    const existingRollNumber = await prisma.enrollment.findFirst({
      where: { classId: input.classId, academicYearId, rollNumber: input.rollNumber },
    });
    if (existingRollNumber) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
  }

  if (input.parents.length === 0) return { ok: false, error: "PARENT_REQUIRED" };

  for (const parentInput of input.parents) {
    if (!isValidPhone(parentInput.phone)) return { ok: false, error: "INVALID_PHONE" };
    const phone = normalizePhone(parentInput.phone);
    const existingParent = await prisma.user.findUnique({ where: { phone } });
    if (existingParent && existingParent.role !== "parent") return { ok: false, error: "PHONE_WRONG_ROLE" };
    if (existingParent && existingParent.schoolId !== schoolId) return { ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" };
  }

  if (input.siblingStudentIds && input.siblingStudentIds.length > 0) {
    const siblingCount = await prisma.student.count({
      where: { id: { in: input.siblingStudentIds }, schoolId },
    });
    if (siblingCount !== input.siblingStudentIds.length) return { ok: false, error: "INVALID_SIBLING" };
  }

  try {
    // The class lookup and capacity check are performed INSIDE this Serializable
    // transaction, atomically with the enrollment write below, rather than in a
    // separate read before the transaction. Two concurrent createStudent calls
    // targeting the same last-seat class would otherwise both read "enrolled <
    // capacity" as true in their own separate reads and both proceed to write —
    // a classic TOCTOU race that would silently overfill the class. Under
    // Serializable isolation, Postgres detects the conflicting read/write sets
    // and aborts the losing transaction with error code P2034, which the API
    // route layer retries once (mirrors recordPayment in fee-payments.ts and
    // createGrade in grades.ts). Every early "ok: false" return below happens
    // before any write in this transaction, so committing an empty transaction
    // on those paths is harmless (same invariant documented on recordPayment).
    return await prisma.$transaction(
      async (tx) => {
        const targetClass = await tx.class.findFirst({
          where: { id: input.classId, schoolId, academicYearId },
        });
        if (!targetClass) return { ok: false, error: "INVALID_CLASS" } as const;

        if (targetClass.capacity !== null) {
          const enrolled = await tx.enrollment.count({
            where: { classId: targetClass.id, academicYearId, status: "active" },
          });
          if (enrolled >= targetClass.capacity) return { ok: false, error: "CLASS_FULL" } as const;
        }

        const createdStudent = await tx.student.create({
          data: {
            schoolId,
            name: input.name,
            dob: new Date(input.dob),
            admissionNo: input.admissionNo,
            photoUrl: input.photoUrl ?? null,
            gender: input.gender ?? null,
            studentIdNumber: input.studentIdNumber ?? null,
            dateOfJoin: input.dateOfJoin ? new Date(input.dateOfJoin) : null,
            address: input.address ?? null,
            bloodGroup: input.bloodGroup ?? null,
            nationality: input.nationality ?? null,
            religion: input.religion ?? null,
            previousSchool: input.previousSchool ?? null,
            emergencyContactName: input.emergencyContactName ?? null,
            emergencyContactPhone: input.emergencyContactPhone ?? null,
            category: input.category ?? null,
            admissionDate: input.admissionDate ? new Date(input.admissionDate) : null,
          },
        });

        await tx.enrollment.create({
          data: {
            studentId: createdStudent.id,
            classId: input.classId,
            academicYearId,
            status: "active",
            rollNumber: input.rollNumber ?? null,
          },
        });

        for (const parentInput of input.parents) {
          const phone = normalizePhone(parentInput.phone);
          const existingParent = await tx.user.findUnique({ where: { phone } });
          const parent =
            existingParent ??
            (await tx.user.create({
              data: {
                schoolId,
                phone,
                name: parentInput.name,
                email: parentInput.email ?? null,
                role: "parent",
              },
            }));

          await tx.parentStudent.create({
            data: { parentUserId: parent.id, studentId: createdStudent.id, relationship: parentInput.relationship },
          });
        }

        if (input.siblingStudentIds) {
          for (const siblingId of input.siblingStudentIds) {
            await tx.studentSibling.create({ data: { studentId: createdStudent.id, siblingId } });
          }
        }

        return {
          ok: true,
          student: { id: createdStudent.id, name: createdStudent.name, admissionNo: createdStudent.admissionNo },
        };
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err) {
    const target = uniqueConstraintTarget(err);
    if (target?.includes("rollNumber")) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    if (target?.includes("studentIdNumber")) return { ok: false, error: "DUPLICATE_STUDENT_ID" };
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
    throw err;
  }
}

export type EditStudentResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE_ADMISSION_NO" }
  | { ok: false; error: "DUPLICATE_ROLL_NUMBER" }
  | { ok: false; error: "DUPLICATE_STUDENT_ID" }
  | { ok: false; error: "PHONE_WRONG_ROLE" }
  | { ok: false; error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" }
  | { ok: false; error: "INVALID_PHONE" }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_SIBLING" }
  | { ok: false; error: "NO_ACTIVE_ENROLLMENT" }
  | { ok: false; error: "CLASS_FULL" };

export async function editStudent(
  prisma: PrismaClient,
  params: {
    studentId: number;
    schoolId: number;
    academicYearId: number | null;
    fields: {
      name?: string;
      dob?: string;
      admissionNo?: string;
      classId?: number;
      rollNumber?: string;
      photoUrl?: string;
      gender?: "male" | "female" | "other";
      studentIdNumber?: string;
      dateOfJoin?: string;
      address?: string;
      bloodGroup?: string;
      nationality?: string;
      religion?: string;
      previousSchool?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      category?: string;
      admissionDate?: string;
      parents?: { relationship: GuardianRelationship; name: string; phone: string; email?: string }[];
      siblingStudentIds?: number[];
    };
  }
): Promise<EditStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.admissionNo && params.fields.admissionNo !== student.admissionNo) {
    const existing = await prisma.student.findUnique({ where: { admissionNo: params.fields.admissionNo } });
    if (existing) return { ok: false, error: "DUPLICATE_ADMISSION_NO" };
  }

  if (params.fields.studentIdNumber && params.fields.studentIdNumber !== student.studentIdNumber) {
    const existing = await prisma.student.findUnique({ where: { studentIdNumber: params.fields.studentIdNumber } });
    if (existing) return { ok: false, error: "DUPLICATE_STUDENT_ID" };
  }

  if (params.fields.siblingStudentIds) {
    if (params.fields.siblingStudentIds.includes(params.studentId)) return { ok: false, error: "INVALID_SIBLING" };
    const siblingCount = await prisma.student.count({
      where: { id: { in: params.fields.siblingStudentIds }, schoolId: params.schoolId },
    });
    if (siblingCount !== params.fields.siblingStudentIds.length) return { ok: false, error: "INVALID_SIBLING" };
  }

  if (params.fields.parents !== undefined) {
    for (const parentInput of params.fields.parents) {
      if (!isValidPhone(parentInput.phone)) return { ok: false, error: "INVALID_PHONE" };
      const phone = normalizePhone(parentInput.phone);
      const existingParent = await prisma.user.findUnique({ where: { phone } });
      if (existingParent && existingParent.role !== "parent") {
        return { ok: false, error: "PHONE_WRONG_ROLE" };
      }
      if (existingParent && existingParent.schoolId !== params.schoolId) {
        return { ok: false, error: "PHONE_BELONGS_TO_ANOTHER_SCHOOL" };
      }
    }
  }

  let enrollment: { classId: number } | null = null;
  if (params.fields.classId !== undefined || params.fields.rollNumber !== undefined) {
    if (!params.academicYearId) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    enrollment = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId } },
    });
    if (!enrollment) return { ok: false, error: "NO_ACTIVE_ENROLLMENT" };

    // Class validation and the capacity check are deliberately NOT done here.
    // They run inside the Serializable transaction below, atomically with the
    // enrollment write, so a concurrent reassignment into the same last-seat
    // class can't race past this read the way it would with a separate
    // read-then-write (see the transaction below for the full rationale).

    if (params.fields.rollNumber) {
      const targetClassId = params.fields.classId ?? enrollment.classId;
      const conflict = await prisma.enrollment.findFirst({
        where: {
          classId: targetClassId,
          academicYearId: params.academicYearId,
          rollNumber: params.fields.rollNumber,
          studentId: { not: params.studentId },
        },
      });
      if (conflict) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    }
  }
  // Captured into a plain value (not the `let enrollment` binding) so it stays
  // narrowed to `number` inside the transaction closure below, across the
  // `await` boundary.
  const currentEnrollmentClassId: number | null = enrollment ? enrollment.classId : null;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Class validation + capacity check, atomic with the writes below.
        // Every early "ok: false" return here happens before any write in
        // this transaction, so committing an empty transaction on those
        // paths is harmless (same invariant documented on recordPayment in
        // fee-payments.ts and createStudent above).
        if (params.fields.classId !== undefined && params.academicYearId && currentEnrollmentClassId !== null) {
          const targetClass = await tx.class.findFirst({
            where: {
              id: params.fields.classId,
              schoolId: params.schoolId,
              academicYearId: params.academicYearId,
            },
          });
          if (!targetClass) return { ok: false, error: "INVALID_CLASS" } as const;

          if (targetClass.id !== currentEnrollmentClassId && targetClass.capacity !== null) {
            const enrolled = await tx.enrollment.count({
              where: { classId: targetClass.id, academicYearId: params.academicYearId, status: "active" },
            });
            if (enrolled >= targetClass.capacity) return { ok: false, error: "CLASS_FULL" } as const;
          }
        }

        const data: {
          name?: string;
          dob?: Date;
          admissionNo?: string;
          photoUrl?: string;
          gender?: "male" | "female" | "other";
          studentIdNumber?: string;
          dateOfJoin?: Date;
          address?: string;
          bloodGroup?: string;
          nationality?: string;
          religion?: string;
          previousSchool?: string;
          emergencyContactName?: string;
          emergencyContactPhone?: string;
          category?: string;
          admissionDate?: Date;
        } = {};
        if (params.fields.name !== undefined) data.name = params.fields.name;
        if (params.fields.dob !== undefined) data.dob = new Date(params.fields.dob);
        if (params.fields.admissionNo !== undefined) data.admissionNo = params.fields.admissionNo;
        if (params.fields.photoUrl !== undefined) data.photoUrl = params.fields.photoUrl;
        if (params.fields.gender !== undefined) data.gender = params.fields.gender;
        if (params.fields.studentIdNumber !== undefined) data.studentIdNumber = params.fields.studentIdNumber;
        if (params.fields.dateOfJoin !== undefined) data.dateOfJoin = new Date(params.fields.dateOfJoin);
        if (params.fields.address !== undefined) data.address = params.fields.address;
        if (params.fields.bloodGroup !== undefined) data.bloodGroup = params.fields.bloodGroup;
        if (params.fields.nationality !== undefined) data.nationality = params.fields.nationality;
        if (params.fields.religion !== undefined) data.religion = params.fields.religion;
        if (params.fields.previousSchool !== undefined) data.previousSchool = params.fields.previousSchool;
        if (params.fields.emergencyContactName !== undefined) data.emergencyContactName = params.fields.emergencyContactName;
        if (params.fields.emergencyContactPhone !== undefined) data.emergencyContactPhone = params.fields.emergencyContactPhone;
        if (params.fields.category !== undefined) data.category = params.fields.category;
        if (params.fields.admissionDate !== undefined) data.admissionDate = new Date(params.fields.admissionDate);
        if (Object.keys(data).length > 0) {
          await tx.student.update({ where: { id: params.studentId }, data });
        }

        if ((params.fields.classId !== undefined || params.fields.rollNumber !== undefined) && params.academicYearId) {
          const enrollmentData: { classId?: number; rollNumber?: string } = {};
          if (params.fields.classId !== undefined) enrollmentData.classId = params.fields.classId;
          if (params.fields.rollNumber !== undefined) enrollmentData.rollNumber = params.fields.rollNumber;
          await tx.enrollment.update({
            where: {
              studentId_academicYearId: { studentId: params.studentId, academicYearId: params.academicYearId },
            },
            data: enrollmentData,
          });
        }

        if (params.fields.parents !== undefined) {
          const existingLinks = await tx.parentStudent.findMany({
            where: { studentId: params.studentId },
            include: { parent: true },
          });
          const newPhones = new Set(params.fields.parents.map((p) => normalizePhone(p.phone)));

          for (const link of existingLinks) {
            if (!newPhones.has(link.parent.phone)) {
              await tx.parentStudent.delete({ where: { id: link.id } });
            }
          }

          for (const parentInput of params.fields.parents) {
            const phone = normalizePhone(parentInput.phone);
            let parent = await tx.user.findUnique({ where: { phone } });
            if (!parent) {
              parent = await tx.user.create({
                data: {
                  schoolId: params.schoolId,
                  phone,
                  name: parentInput.name,
                  email: parentInput.email ?? null,
                  role: "parent",
                },
              });
            } else {
              await tx.user.update({
                where: { id: parent.id },
                data: { name: parentInput.name, email: parentInput.email ?? null },
              });
            }

            await tx.parentStudent.upsert({
              where: { parentUserId_studentId: { parentUserId: parent.id, studentId: params.studentId } },
              update: { relationship: parentInput.relationship },
              create: { parentUserId: parent.id, studentId: params.studentId, relationship: parentInput.relationship },
            });
          }
        }

        if (params.fields.siblingStudentIds !== undefined) {
          await tx.studentSibling.deleteMany({
            where: { OR: [{ studentId: params.studentId }, { siblingId: params.studentId }] },
          });
          for (const siblingId of params.fields.siblingStudentIds) {
            await tx.studentSibling.create({ data: { studentId: params.studentId, siblingId } });
          }
        }

        return { ok: true } as const;
      },
      { isolationLevel: "Serializable" }
    );
    return result;
  } catch (err) {
    const target = uniqueConstraintTarget(err);
    if (target?.includes("rollNumber")) return { ok: false, error: "DUPLICATE_ROLL_NUMBER" };
    if (target?.includes("studentIdNumber")) return { ok: false, error: "DUPLICATE_STUDENT_ID" };
    throw err;
  }
}

export type DeleteStudentResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "HAS_HISTORY" };

export async function deleteStudent(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number }
): Promise<DeleteStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  const [attendanceCount, markCount, feePaymentCount, assignmentStatusCount, promotionLogCount, enrollmentCount] =
    await Promise.all([
      prisma.attendance.count({ where: { studentId: params.studentId } }),
      prisma.mark.count({ where: { studentId: params.studentId } }),
      prisma.feePayment.count({ where: { studentId: params.studentId } }),
      prisma.assignmentStatus.count({ where: { studentId: params.studentId } }),
      prisma.promotionLogEntry.count({ where: { studentId: params.studentId } }),
      prisma.enrollment.count({ where: { studentId: params.studentId } }),
    ]);

  const hasHistory =
    attendanceCount + markCount + feePaymentCount + assignmentStatusCount + promotionLogCount > 0 ||
    enrollmentCount > 1;
  if (hasHistory) return { ok: false, error: "HAS_HISTORY" };

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.deleteMany({ where: { studentId: params.studentId } });
    await tx.parentStudent.deleteMany({ where: { studentId: params.studentId } });
    await tx.student.delete({ where: { id: params.studentId } });
  });

  return { ok: true, deleted: true };
}

export type DeactivateStudentResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function deactivateStudent(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number; academicYearId: number | null }
): Promise<DeactivateStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: params.studentId }, data: { status: "inactive" } });
    if (params.academicYearId) {
      await tx.enrollment.updateMany({
        where: { studentId: params.studentId, academicYearId: params.academicYearId },
        data: { status: "inactive" },
      });
    }
  });

  return { ok: true };
}

export type ActivateStudentResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

export async function activateStudent(
  prisma: PrismaClient,
  params: { studentId: number; schoolId: number; academicYearId: number | null }
): Promise<ActivateStudentResult> {
  const student = await prisma.student.findFirst({ where: { id: params.studentId, schoolId: params.schoolId } });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: params.studentId }, data: { status: "active" } });
    if (params.academicYearId) {
      await tx.enrollment.updateMany({
        where: { studentId: params.studentId, academicYearId: params.academicYearId, status: "inactive" },
        data: { status: "active" },
      });
    }
  });

  return { ok: true };
}
