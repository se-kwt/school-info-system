import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { editAssignment } from "@/lib/assignments";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["teacher"]);

    const assignmentId = Number(params.id);
    if (Number.isNaN(assignmentId)) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    let body: {
      subjectId?: number;
      title?: string;
      description?: string;
      dueDate?: string;
      attachmentUrl?: string;
      attachmentName?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (
      body.subjectId === undefined &&
      body.title === undefined &&
      body.description === undefined &&
      body.dueDate === undefined &&
      body.attachmentUrl === undefined &&
      body.attachmentName === undefined
    ) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const result = await editAssignment(prisma, {
      assignmentId,
      teacherUserId: claims.userId,
      schoolId: claims.schoolId,
      fields: body,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Only the teacher who created this assignment can edit it" },
        { status: 403 }
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
