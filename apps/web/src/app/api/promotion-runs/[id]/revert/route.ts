import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { revertPromotionRun } from "@/lib/promotion";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    const result = await revertPromotionRun(prisma, { promotionRunId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
      }
      if (result.error === "NOT_CONFIRMED") {
        return NextResponse.json({ error: "This promotion run was never confirmed" }, { status: 400 });
      }
      if (result.error === "ANOTHER_YEAR_ACTIVE") {
        return NextResponse.json(
          { error: "Another academic year is currently active — archive it before reverting" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "This promotion can no longer be undone - the new year already has data recorded against it" },
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
