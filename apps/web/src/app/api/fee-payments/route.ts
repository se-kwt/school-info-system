import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getFeeRoster } from "@/lib/fee-payments";

export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["admin", "accountant"]);

    const { searchParams } = new URL(request.url);
    const feeStructureIdParam = searchParams.get("feeStructureId");
    if (!feeStructureIdParam) {
      return NextResponse.json({ error: "feeStructureId is required" }, { status: 400 });
    }
    const feeStructureId = Number(feeStructureIdParam);
    if (Number.isNaN(feeStructureId)) {
      return NextResponse.json({ error: "feeStructureId is required" }, { status: 400 });
    }

    const result = await getFeeRoster(prisma, { feeStructureId, schoolId: claims.schoolId });

    if (!result.ok) {
      return NextResponse.json(
        { error: "The selected fee structure does not exist" },
        { status: 400 }
      );
    }

    return NextResponse.json({ students: result.students });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
