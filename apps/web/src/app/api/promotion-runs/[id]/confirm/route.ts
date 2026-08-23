import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { confirmPromotionRun } from "@/lib/promotion";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const rollover = body?.rollover as
      | { classes: boolean; faculty: boolean; timetable: boolean; feeStructures: boolean }
      | undefined;

    const result = await confirmPromotionRun(prisma, {
      promotionRunId,
      schoolId: claims.schoolId,
      rollover,
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
      return NextResponse.json(
        { error: "All students must have a decision before confirming" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, rollover: result.rollover });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
