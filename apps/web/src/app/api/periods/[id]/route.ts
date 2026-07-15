import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { deletePeriod } from "@/lib/periods";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);
    const periodId = Number(params.id);
    if (Number.isNaN(periodId)) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }

    const result = await deletePeriod(prisma, { periodId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Period not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "This period has timetable entries and cannot be deleted", deletable: false },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
