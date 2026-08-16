import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { deleteStudent, editStudent } from "@/lib/school-setup/students";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
      gender?: "male" | "female";
      studentIdNumber?: string;
      dateOfJoin?: string;
      parents?: { relationship: string; name: string; phone: string; email?: string }[];
      siblingStudentIds?: number[];
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
    const result = await editStudent(prisma, {
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
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      if (result.error === "INVALID_SIBLING") {
        return NextResponse.json({ error: "One of the selected siblings is invalid" }, { status: 400 });
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
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
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
