import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getRunSummary } from "@/lib/promotion";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    const result = await getRunSummary(prisma, { promotionRunId, schoolId: claims.schoolId });
    if (!result.ok) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }
    return NextResponse.json({ counts: result.counts, undecidedStudentIds: result.undecidedStudentIds });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
