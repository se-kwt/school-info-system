import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { createAcademicYear, listAcademicYears } from "@/lib/academic-years";

export async function GET() {
  try {
    const claims = requireApiRole(["admin", "teacher", "accountant"]);
    const academicYears = await listAcademicYears(prisma, claims.schoolId);
    return NextResponse.json({ academicYears });
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
    let startDate: string | undefined;
    let endDate: string | undefined;
    try {
      ({ name, startDate, endDate } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: "name, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const result = await createAcademicYear(prisma, claims.schoolId, { name, startDate, endDate });
    if (!result.ok) {
      if (result.error === "INVALID_DATE_RANGE") {
        return NextResponse.json({ error: "startDate must be before endDate" }, { status: 400 });
      }
      return NextResponse.json(
        { error: "An academic year with this name already exists" },
        { status: 400 }
      );
    }

    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
