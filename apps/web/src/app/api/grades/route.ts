import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listGrades, createGrade } from "@/lib/school-setup/grades";

export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["admin", "teacher"]);
    const { searchParams } = new URL(request.url);
    const academicYearIdParam = searchParams.get("academicYearId");
    const grades = await listGrades(prisma, claims.schoolId, {
      academicYearId: academicYearIdParam ? Number(academicYearIdParam) : undefined,
    });
    return NextResponse.json(grades);
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
    try {
      ({ name } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await createGrade(prisma, claims.schoolId, { name });
    if (!result.ok) {
      return NextResponse.json({ error: "A grade with this name already exists" }, { status: 409 });
    }

    return NextResponse.json(result.grade, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
