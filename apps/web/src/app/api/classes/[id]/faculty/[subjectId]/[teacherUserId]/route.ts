import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { unassignTeacherFromSubject } from "@/lib/school-setup/class-teachers";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; subjectId: string; teacherUserId: string } }
) {
  try {
    const claims = await requireApiRole(["admin"]);
    const classId = Number(params.id);
    const subjectId = Number(params.subjectId);
    const teacherUserId = Number(params.teacherUserId);
    if (Number.isNaN(classId) || Number.isNaN(subjectId) || Number.isNaN(teacherUserId)) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const result = await unassignTeacherFromSubject(prisma, { classId, schoolId: claims.schoolId, subjectId, teacherUserId });
    if (!result.ok) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
