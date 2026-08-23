import { NextResponse } from "next/server";
import { Prisma, type GuardianRelationship } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { deleteStudent, editStudent, type EditStudentResult } from "@/lib/school-setup/students";

/**
 * `editStudent` runs its class-reassignment capacity check inside a
 * Serializable transaction together with the enrollment write (see
 * students.ts). Retry once on a conflict — same pattern/rationale as
 * `createStudentWithRetry` in /api/students/route.ts.
 */
function isTransactionConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2034" || err.code === "P2028")
  );
}

async function editStudentWithRetry(params: Parameters<typeof editStudent>[1]): Promise<EditStudentResult> {
  try {
    return await editStudent(prisma, params);
  } catch (err) {
    if (isTransactionConflict(err)) {
      return await editStudent(prisma, params);
    }
    throw err;
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const studentId = Number(params.id);
    if (Number.isNaN(studentId)) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    let body: {
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
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
    const result = await editStudentWithRetry({
      studentId,
      schoolId: claims.schoolId,
      academicYearId: activeYear?.id ?? null,
      fields: body,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Student not found" }, { status: 404 });
      }
      if (result.error === "DUPLICATE_ADMISSION_NO") {
        return NextResponse.json(
          { error: "A student with this admission number already exists" },
          { status: 409 }
        );
      }
      if (result.error === "DUPLICATE_ROLL_NUMBER") {
        return NextResponse.json(
          { error: "A student with this roll number already exists in this class" },
          { status: 409 }
        );
      }
      if (result.error === "DUPLICATE_STUDENT_ID") {
        return NextResponse.json({ error: "A student with this ID number already exists" }, { status: 409 });
      }
      if (result.error === "PHONE_WRONG_ROLE") {
        return NextResponse.json(
          { error: "This phone number is already associated with a non-parent account" },
          { status: 409 }
        );
      }
      if (result.error === "PHONE_BELONGS_TO_ANOTHER_SCHOOL") {
        return NextResponse.json(
          { error: "This parent phone number is associated with a different school" },
          { status: 409 }
        );
      }
      if (result.error === "INVALID_PHONE") {
        return NextResponse.json({ error: "One of the parent phone numbers is not valid" }, { status: 400 });
      }
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      if (result.error === "INVALID_SIBLING") {
        return NextResponse.json({ error: "One of the selected siblings is invalid" }, { status: 400 });
      }
      if (result.error === "CLASS_FULL") {
        return NextResponse.json({ error: "The selected class has reached its capacity" }, { status: 400 });
      }
      return NextResponse.json(
        { error: "This student has no active enrollment to reassign" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (isTransactionConflict(err)) {
      return NextResponse.json(
        { error: "This request conflicted with another update. Please try again." },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const studentId = Number(params.id);
    if (Number.isNaN(studentId)) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const result = await deleteStudent(prisma, { studentId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Student not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "This student has recorded history and cannot be deleted", deletable: false },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
