import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listClassFaculty, assignTeacherToSubject } from "@/lib/school-setup/class-teachers";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["admin", "teacher"]);
    const classId = Number(params.id);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const result = await listClassFaculty(prisma, { classId, schoolId: claims.schoolId });
    if (!result.ok) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }
    return NextResponse.json(result.assignments);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["admin"]);
    const classId = Number(params.id);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    let subjectId: number | undefined;
    let teacherUserId: number | undefined;
    try {
      ({ subjectId, teacherUserId } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!subjectId || !teacherUserId) {
      return NextResponse.json({ error: "subjectId and teacherUserId are required" }, { status: 400 });
    }

    const result = await assignTeacherToSubject(prisma, { classId, schoolId: claims.schoolId, subjectId, teacherUserId });
    if (!result.ok) {
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }
      if (result.error === "INVALID_SUBJECT") {
        return NextResponse.json({ error: "This subject does not belong to the class's grade" }, { status: 400 });
      }
      if (result.error === "INVALID_TEACHER") {
        return NextResponse.json({ error: "The selected teacher does not exist at this school" }, { status: 400 });
      }
      return NextResponse.json({ error: "This teacher is already assigned to this subject" }, { status: 409 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
