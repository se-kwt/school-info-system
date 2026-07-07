import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getFeeRoster, recordPayment } from "@/lib/fee-payments";

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

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin", "accountant"]);

    let feeStructureId: number | undefined;
    let studentId: number | undefined;
    let amount: number | undefined;
    try {
      ({ feeStructureId, studentId, amount } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!feeStructureId || !studentId || amount === undefined) {
      return NextResponse.json(
        { error: "feeStructureId, studentId, and amount are required" },
        { status: 400 }
      );
    }

    const result = await recordPayment(prisma, {
      feeStructureId,
      studentId,
      schoolId: claims.schoolId,
      recordedById: claims.userId,
      amount,
    });

    if (!result.ok) {
      if (result.error === "INVALID_FEE_STRUCTURE") {
        return NextResponse.json(
          { error: "The selected fee structure does not exist" },
          { status: 400 }
        );
      }
      if (result.error === "STUDENT_MISMATCH") {
        return NextResponse.json(
          { error: "This student does not belong to the fee structure's class" },
          { status: 400 }
        );
      }
      if (result.error === "INVALID_AMOUNT") {
        return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
      }
      return NextResponse.json(
        { error: "This payment would exceed the amount due" },
        { status: 400 }
      );
    }

    return NextResponse.json({ amountPaid: result.amountPaid, status: result.status });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
