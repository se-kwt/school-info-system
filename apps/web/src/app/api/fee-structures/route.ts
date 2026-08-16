import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listFeeStructures, createFeeStructure } from "@/lib/fee-structures";
import { resolveAcademicYear } from "@/lib/academic-years";

export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["admin", "accountant"]);

    const { searchParams } = new URL(request.url);
    const classIdParam = searchParams.get("classId");
    if (!classIdParam) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }
    const classId = Number(classIdParam);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const result = await listFeeStructures(prisma, { classId, schoolId: claims.schoolId });

    if (!result.ok) {
      return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
    }

    return NextResponse.json({ feeStructures: result.feeStructures });
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

    let classId: number | undefined;
    let term: string | undefined;
    let amount: number | undefined;
    let dueDate: string | undefined;
    try {
      ({ classId, term, amount, dueDate } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || !term || !amount || !dueDate) {
      return NextResponse.json(
        { error: "classId, term, amount, and dueDate are required" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await createFeeStructure(prisma, claims.schoolId, yearResult.academicYear.id, {
      classId,
      term,
      amount,
      dueDate,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
    }

    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
