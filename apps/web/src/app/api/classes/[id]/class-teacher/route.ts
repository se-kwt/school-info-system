import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { setClassTeacher } from "@/lib/school-setup/class-teachers";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["admin"]);
    const classId = Number(params.id);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    let teacherUserId: number | undefined;
    try {
      ({ teacherUserId } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!teacherUserId) {
      return NextResponse.json({ error: "teacherUserId is required" }, { status: 400 });
    }

    const result = await setClassTeacher(prisma, { classId, schoolId: claims.schoolId, teacherUserId });
    if (!result.ok) {
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "The class teacher must already be assigned to teach a subject in this class" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
