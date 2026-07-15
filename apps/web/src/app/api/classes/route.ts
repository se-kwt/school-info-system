import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listClasses, createClass } from "@/lib/school-setup/classes";

export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    const academicYearIdParam = searchParams.get("academicYearId");
    const classes = await listClasses(prisma, claims.schoolId, {
      includeArchived,
      academicYearId: academicYearIdParam ? Number(academicYearIdParam) : undefined,
    });
    return NextResponse.json(classes);
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

    let gradeId: number | undefined;
    let section: string | undefined;
    let academicYearId: number | undefined;
    try {
      ({ gradeId, section, academicYearId } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!gradeId || !section || !academicYearId) {
      return NextResponse.json({ error: "gradeId, section, and academicYearId are required" }, { status: 400 });
    }

    const result = await createClass(prisma, claims.schoolId, { gradeId, section, academicYearId });
    if (!result.ok) {
      if (result.error === "INVALID_GRADE") {
        return NextResponse.json({ error: "The selected grade does not exist" }, { status: 400 });
      }
      if (result.error === "INVALID_YEAR") {
        return NextResponse.json({ error: "The selected academic year does not exist" }, { status: 400 });
      }
      return NextResponse.json({ error: "A class with this grade, section, and year already exists" }, { status: 409 });
    }

    return NextResponse.json(result.class, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
