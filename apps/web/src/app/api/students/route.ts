import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listStudents, createStudent } from "@/lib/school-setup/students";
import { resolveAcademicYear } from "@/lib/academic-years";

export async function GET() {
  try {
    const claims = requireApiRole(["admin"]);
    const students = await listStudents(prisma, claims.schoolId);
    return NextResponse.json(students);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let name: string | undefined;
    let dob: string | undefined;
    let classId: number | undefined;
    let admissionNo: string | undefined;
    let parentPhone: string | undefined;
    let parentName: string | undefined;
    try {
      ({ name, dob, classId, admissionNo, parentPhone, parentName } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !dob || !classId || !admissionNo || !parentPhone) {
      return NextResponse.json(
        { error: "name, dob, classId, admissionNo, and parentPhone are required" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await createStudent(prisma, claims.schoolId, yearResult.academicYear.id, {
      name,
      dob,
      classId,
      admissionNo,
      parentPhone,
      parentName,
    });

    if (!result.ok) {
      if (result.error === "DUPLICATE_ADMISSION_NO") {
        return NextResponse.json(
          { error: "A student with this admission number already exists" },
          { status: 409 }
        );
      }
      if (result.error === "PHONE_WRONG_ROLE") {
        return NextResponse.json(
          { error: "This phone number is already registered as a different role" },
          { status: 409 }
        );
      }
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      return NextResponse.json(
        { error: "parentName is required to create a new parent account" },
        { status: 400 }
      );
    }

    return NextResponse.json(result.student, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
