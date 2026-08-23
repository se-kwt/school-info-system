import type { EnrollmentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { setStudentDecisions } from "@/lib/promotion";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
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
      if (result.error === "ALREADY_CONFIRMED") {
        return NextResponse.json(
          { error: "This promotion run has already been confirmed" },
          { status: 409 }
        );
      }
      if (result.error === "STUDENT_NOT_IN_RUN") {
        return NextResponse.json(
          { error: "One or more students are not part of this promotion run" },
          { status: 400 }
        );
      }
      if (result.error === "INVALID_TARGET_CLASS") {
        return NextResponse.json(
          { error: "Target class must belong to this school and the target academic year" },
          { status: 400 }
        );
      }
      if (result.error === "INVALID_GRADE_PROGRESSION") {
        return NextResponse.json(
          { error: "A class can only be promoted into the next grade up, or retained in the same grade" },
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
