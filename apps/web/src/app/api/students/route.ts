import { NextResponse } from "next/server";
import type { GuardianRelationship } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listStudents, createStudent } from "@/lib/school-setup/students";
import { resolveAcademicYear } from "@/lib/academic-years";

export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["admin"]);
    const { searchParams } = new URL(request.url);

    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");

    const page = pageParam ? Number(pageParam) : undefined;
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const options = (page && pageSize && !isNaN(page) && !isNaN(pageSize))
      ? { page, pageSize }
      : undefined;

    const students = await listStudents(prisma, claims.schoolId, options);
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
    const claims = await requireApiRole(["admin"]);

    let name: string | undefined;
    let dob: string | undefined;
    let classId: number | undefined;
    let admissionNo: string | undefined;
    let rollNumber: string | undefined;
    let photoUrl: string | undefined;
    let gender: "male" | "female" | "other" | undefined;
    let studentIdNumber: string | undefined;
    let dateOfJoin: string | undefined;
    let address: string | undefined;
    let bloodGroup: string | undefined;
    let nationality: string | undefined;
    let religion: string | undefined;
    let previousSchool: string | undefined;
    let emergencyContactName: string | undefined;
    let emergencyContactPhone: string | undefined;
    let category: string | undefined;
    let admissionDate: string | undefined;
    let parents: { relationship: GuardianRelationship; name: string; phone: string; email?: string }[] | undefined;
    let siblingStudentIds: number[] | undefined;
    try {
      ({
        name,
        dob,
        classId,
        admissionNo,
        rollNumber,
        photoUrl,
        gender,
        studentIdNumber,
        dateOfJoin,
        address,
        bloodGroup,
        nationality,
        religion,
        previousSchool,
        emergencyContactName,
        emergencyContactPhone,
        category,
        admissionDate,
        parents,
        siblingStudentIds,
      } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !dob || !classId || !admissionNo || !parents) {
      return NextResponse.json(
        { error: "name, dob, classId, admissionNo, and parents are required" },
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
      rollNumber,
      photoUrl,
      gender,
      studentIdNumber,
      dateOfJoin,
      address,
      bloodGroup,
      nationality,
      religion,
      previousSchool,
      emergencyContactName,
      emergencyContactPhone,
      category,
      admissionDate,
      parents,
      siblingStudentIds,
    });

    if (!result.ok) {
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
          { error: "This phone number is already registered as a different role" },
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
      return NextResponse.json({ error: "At least one parent is required" }, { status: 400 });
    }

    return NextResponse.json(result.student, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
