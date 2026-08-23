import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listPaymentsForStudent } from "@/lib/fee-payments";

export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["admin", "accountant"]);

    const { searchParams } = new URL(request.url);
    const feeStructureIdParam = searchParams.get("feeStructureId");
    const studentIdParam = searchParams.get("studentId");
    if (!feeStructureIdParam || !studentIdParam) {
      return NextResponse.json(
        { error: "feeStructureId and studentId are required" },
        { status: 400 }
      );
    }
    const feeStructureId = Number(feeStructureIdParam);
    const studentId = Number(studentIdParam);
    if (Number.isNaN(feeStructureId) || Number.isNaN(studentId)) {
      return NextResponse.json(
        { error: "feeStructureId and studentId are required" },
        { status: 400 }
      );
    }

    const result = await listPaymentsForStudent(prisma, {
      feeStructureId,
      studentId,
      schoolId: claims.schoolId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "The selected fee structure does not exist" },
        { status: 400 }
      );
    }

    return NextResponse.json({ payments: result.payments });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
