import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { editTimetableEntry, deleteTimetableEntry } from "@/lib/timetable";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const entryId = Number(params.id);
    if (Number.isNaN(entryId)) {
      return NextResponse.json({ error: "Timetable entry not found" }, { status: 404 });
    }

    let body: { subjectId?: number; teacherUserId?: number | null };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!("subjectId" in body) && !("teacherUserId" in body)) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const result = await editTimetableEntry(prisma, {
      entryId,
      schoolId: claims.schoolId,
      fields: body,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Timetable entry not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "The selected teacher is not assigned to teach this subject on this class" },
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

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);

    const entryId = Number(params.id);
    if (Number.isNaN(entryId)) {
      return NextResponse.json({ error: "Timetable entry not found" }, { status: 404 });
    }

    const result = await deleteTimetableEntry(prisma, { entryId, schoolId: claims.schoolId });

    if (!result.ok) {
      return NextResponse.json({ error: "Timetable entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
