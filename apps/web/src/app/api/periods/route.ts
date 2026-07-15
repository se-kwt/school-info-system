import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listPeriods, createPeriod } from "@/lib/periods";

export async function GET() {
  try {
    const claims = requireApiRole(["admin", "teacher"]);
    const periods = await listPeriods(prisma, claims.schoolId);
    return NextResponse.json(periods);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let order: number | undefined;
    let label: string | undefined;
    let isBreak: boolean | undefined;
    let startTime: string | undefined;
    let endTime: string | undefined;
    try {
      ({ order, label, isBreak, startTime, endTime } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (order === undefined || !label || !startTime || !endTime) {
      return NextResponse.json({ error: "order, label, startTime, and endTime are required" }, { status: 400 });
    }

    const result = await createPeriod(prisma, claims.schoolId, { order, label, isBreak, startTime, endTime });
    if (!result.ok) {
      return NextResponse.json({ error: "A period with this order already exists" }, { status: 409 });
    }

    return NextResponse.json(result.period, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
