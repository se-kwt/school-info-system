import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listGrades, createGrade, type CreateGradeResult } from "@/lib/school-setup/grades";

/**
 * `createGrade` runs inside a Serializable transaction when it auto-assigns
 * sortOrder (see grades.ts). Under real concurrent writes, Postgres can abort
 * the losing transaction with a serialization failure (Prisma error code
 * P2034) instead of silently letting two grades collide on the same
 * sortOrder. Retry once — mirrors `recordPaymentWithRetry` in
 * /api/fee-payments/route.ts.
 */
function isTransactionConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2034" || err.code === "P2028")
  );
}

async function createGradeWithRetry(
  schoolId: number,
  input: Parameters<typeof createGrade>[2]
): Promise<CreateGradeResult> {
  try {
    return await createGrade(prisma, schoolId, input);
  } catch (err) {
    if (isTransactionConflict(err)) {
      return await createGrade(prisma, schoolId, input);
    }
    throw err;
  }
}

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

    const result = await createGradeWithRetry(claims.schoolId, { name });
    if (!result.ok) {
      return NextResponse.json({ error: "A grade with this name already exists" }, { status: 409 });
    }

    return NextResponse.json(result.grade, { status: 201 });
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
