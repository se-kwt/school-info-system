import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { updateMappings } from "@/lib/promotion";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);
    const promotionRunId = Number(params.id);
    if (Number.isNaN(promotionRunId)) {
      return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
    }

    let mappings: Array<{ fromClassId: number; toClassId: number | null }> | undefined;
    try {
      ({ mappings } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!mappings) return NextResponse.json({ error: "mappings is required" }, { status: 400 });

    const result = await updateMappings(prisma, { promotionRunId, schoolId: claims.schoolId, mappings });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Promotion run not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "One or more classes are not part of this promotion run" },
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
