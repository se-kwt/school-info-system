import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { deleteClass, editClass } from "@/lib/school-setup/classes";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);
    const classId = Number(params.id);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    let body: { gradeId?: number; section?: string; academicYearId?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.gradeId === undefined && body.section === undefined && body.academicYearId === undefined) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const result = await editClass(prisma, { classId, schoolId: claims.schoolId, fields: body });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "A class with this grade, section, and year already exists" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);
    const classId = Number(params.id);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const result = await deleteClass(prisma, { classId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "This class has enrollment or scheduling history and cannot be deleted", deletable: false },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
