import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { editGrade, deleteGrade } from "@/lib/school-setup/grades";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const gradeId = Number(params.id);
    if (Number.isNaN(gradeId)) {
      return NextResponse.json({ error: "Grade not found" }, { status: 404 });
    }

    let name: string | undefined;
    try {
      ({ name } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await editGrade(prisma, { gradeId, schoolId: claims.schoolId, name });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Grade not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "A grade with this name already exists" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const gradeId = Number(params.id);
    if (Number.isNaN(gradeId)) {
      return NextResponse.json({ error: "Grade not found" }, { status: 404 });
    }

    const result = await deleteGrade(prisma, { gradeId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Grade not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "This grade has subjects or classes and cannot be deleted", deletable: false },
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
