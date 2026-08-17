import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { setPeriodDayOverride, clearPeriodDayOverride } from "@/lib/periods";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const periodId = Number(params.id);
    if (Number.isNaN(periodId)) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }

    let dayOfWeek: number | undefined;
    let startTime: string | undefined;
    let endTime: string | undefined;
    try {
      ({ dayOfWeek, startTime, endTime } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json({ error: "dayOfWeek, startTime, and endTime are required" }, { status: 400 });
    }

    const result = await setPeriodDayOverride(prisma, { periodId, schoolId: claims.schoolId, dayOfWeek, startTime, endTime });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Period not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "dayOfWeek must be between 0 and 6" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const periodId = Number(params.id);
    if (Number.isNaN(periodId)) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const dayOfWeekParam = searchParams.get("dayOfWeek");
    if (!dayOfWeekParam) {
      return NextResponse.json({ error: "dayOfWeek is required" }, { status: 400 });
    }
    const dayOfWeek = Number(dayOfWeekParam);
    if (Number.isNaN(dayOfWeek)) {
      return NextResponse.json({ error: "dayOfWeek is required" }, { status: 400 });
    }

    const result = await clearPeriodDayOverride(prisma, { periodId, schoolId: claims.schoolId, dayOfWeek });
    if (!result.ok) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
