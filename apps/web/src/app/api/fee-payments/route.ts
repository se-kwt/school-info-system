import { NextResponse } from "next/server";
import { Prisma, PaymentMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getFeeRoster, recordPayment, type RecordPaymentResult } from "@/lib/fee-payments";

const VALID_PAYMENT_MODES = new Set<string>(Object.values(PaymentMode));

/**
 * `recordPayment` runs inside a Serializable transaction. Under real
 * concurrent writes, Postgres can abort the losing transaction with a
 * serialization failure (Prisma error code P2034) instead of silently
 * corrupting data. That's the whole point of Serializable isolation, but it
 * means a legitimate double-submit can throw instead of both requests
 * cleanly succeeding. Retry once — the retry reads the other request's
 * already-committed write and either succeeds or returns a normal
 * business-rule error (e.g. EXCEEDS_AMOUNT_DUE), never a 500.
 *
 * P2028 (transaction API error, e.g. the interactive transaction's timeout
 * being exceeded under contention) is treated the same way — it's another
 * failure mode that shows up specifically under contention and should be
 * retried/handled like a conflict rather than escaping as an unhandled 500.
 */
function isTransactionConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2034" || err.code === "P2028")
  );
}

async function recordPaymentWithRetry(
  params: Parameters<typeof recordPayment>[1]
): Promise<RecordPaymentResult> {
  try {
    return await recordPayment(prisma, params);
  } catch (err) {
    if (isTransactionConflict(err)) {
      return await recordPayment(prisma, params);
    }
    throw err;
  }
}

export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["admin", "accountant"]);

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
    const claims = await requireApiRole(["admin", "accountant"]);

    let feeStructureId: number | undefined;
    let studentId: number | undefined;
    let amount: number | undefined;
    let mode: string | undefined;
    let reference: string | undefined;
    try {
      ({ feeStructureId, studentId, amount, mode, reference } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!feeStructureId || !studentId || amount === undefined) {
      return NextResponse.json(
        { error: "feeStructureId, studentId, and amount are required" },
        { status: 400 }
      );
    }

    if (!mode || !VALID_PAYMENT_MODES.has(mode)) {
      return NextResponse.json(
        { error: "mode is required and must be one of: " + Array.from(VALID_PAYMENT_MODES).join(", ") },
        { status: 400 }
      );
    }

    const result = await recordPaymentWithRetry({
      feeStructureId,
      studentId,
      schoolId: claims.schoolId,
      recordedById: claims.userId,
      amount,
      mode: mode as PaymentMode,
      reference,
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

    return NextResponse.json({
      amountPaid: result.amountPaid,
      status: result.status,
      receiptNo: result.receiptNo,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (isTransactionConflict(err)) {
      return NextResponse.json(
        { error: "This payment conflicted with another update. Please try again." },
        { status: 409 }
      );
    }
    throw err;
  }
}
