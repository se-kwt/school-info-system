import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listStaff, createStaff } from "@/lib/school-setup/staff";
import { resolveAcademicYear } from "@/lib/academic-years";

const VALID_ROLES = ["teacher", "admin", "accountant"] as const;
type StaffRole = (typeof VALID_ROLES)[number];

function isValidRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (VALID_ROLES as readonly string[]).includes(value);
}

export async function GET() {
  try {
    const claims = requireApiRole(["admin"]);
    const staff = await listStaff(prisma, claims.schoolId);
    return NextResponse.json(staff);
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
    let phone: string | undefined;
    let role: unknown;
    let classId: number | undefined;
    let subjectId: number | undefined;
    try {
      ({ name, phone, role, classId, subjectId } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !phone || !isValidRole(role)) {
      return NextResponse.json({ error: "name, phone, and role are required" }, { status: 400 });
    }

    if (classId && !subjectId) {
      return NextResponse.json(
        { error: "subjectId is required when assigning a class" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await createStaff(prisma, claims.schoolId, yearResult.academicYear.id, {
      name,
      phone,
      role,
      classId,
      subjectId,
    });
    if (!result.ok) {
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      if (result.error === "INVALID_SUBJECT") {
        return NextResponse.json({ error: "This subject does not belong to the class's grade" }, { status: 400 });
      }
      return NextResponse.json({ error: "This phone number is already registered" }, { status: 409 });
    }

    return NextResponse.json(result.staff, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
