import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { startOrResumePromotionRun } from "@/lib/promotion";

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let toAcademicYearId: number | undefined;
    try {
      ({ toAcademicYearId } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!toAcademicYearId) {
      return NextResponse.json({ error: "toAcademicYearId is required" }, { status: 400 });
    }

    const result = await startOrResumePromotionRun(prisma, {
      schoolId: claims.schoolId,
      initiatedById: claims.userId,
      toAcademicYearId,
    });
    if (!result.ok) {
      if (result.error === "NO_ACTIVE_YEAR") {
        return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
      }
      return NextResponse.json({ error: "The selected academic year does not exist" }, { status: 400 });
    }

    return NextResponse.json({ id: result.id, mappings: result.mappings });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
