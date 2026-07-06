import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getAssignmentStatuses, updateAssignmentStatuses } from "@/lib/assignments";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);

    const assignmentId = Number(params.id);
    if (Number.isNaN(assignmentId)) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const result = await getAssignmentStatuses(prisma, {
      assignmentId,
      schoolId: claims.schoolId,
      role: claims.role,
      userId: claims.userId,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
    }

    return NextResponse.json({ statuses: result.statuses });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["teacher"]);

    const assignmentId = Number(params.id);
    if (Number.isNaN(assignmentId)) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    let entries: Array<{ studentId: number; status: string }> | undefined;
    try {
      ({ entries } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: "entries are required" }, { status: 400 });
    }
    for (const entry of entries) {
      if (entry.status !== "pending" && entry.status !== "submitted") {
        return NextResponse.json({ error: "status must be pending or submitted" }, { status: 400 });
      }
    }

    const result = await updateAssignmentStatuses(prisma, {
      assignmentId,
      schoolId: claims.schoolId,
      teacherUserId: claims.userId,
      entries: entries as Array<{ studentId: number; status: "pending" | "submitted" }>,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      return NextResponse.json(
        { error: "One or more students do not belong to this class" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
