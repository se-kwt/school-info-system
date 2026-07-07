import type { EnrollmentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { setStudentDecisions } from "@/lib/promotion";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);
    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    let decisions: Array<{ studentId: number; action: EnrollmentStatus; toClassId?: number }> | undefined;
    try {
      ({ decisions } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!decisions || decisions.length === 0) {
      return NextResponse.json({ error: "decisions is required" }, { status: 400 });
    }

    const result = await setStudentDecisions(prisma, {
      promotionRunId,
      schoolId: claims.schoolId,
      decisions,
    });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
      }
      if (result.error === "STUDENT_NOT_IN_RUN") {
        return NextResponse.json(
          { error: "One or more students are not part of this promotion run" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'toClassId is required when action is "promoted"' },
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
