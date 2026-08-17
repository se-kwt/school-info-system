import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { deleteSubject } from "@/lib/school-setup/subjects";

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const subjectId = Number(params.id);
    if (Number.isNaN(subjectId)) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    const result = await deleteSubject(prisma, { subjectId, schoolId: claims.schoolId });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Subject not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "This subject has syllabus, faculty, or scheduling history and cannot be deleted", deletable: false },
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
