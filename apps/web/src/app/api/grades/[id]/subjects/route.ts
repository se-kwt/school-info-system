import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listSubjects, createSubject } from "@/lib/school-setup/subjects";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin", "teacher"]);
    const gradeId = Number(params.id);
    if (Number.isNaN(gradeId)) {
      return NextResponse.json({ error: "Grade not found" }, { status: 404 });
    }

    const result = await listSubjects(prisma, { gradeId, schoolId: claims.schoolId });
    if (!result.ok) {
      return NextResponse.json({ error: "Grade not found" }, { status: 404 });
    }
    return NextResponse.json(result.subjects);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);
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

    const result = await createSubject(prisma, { gradeId, schoolId: claims.schoolId, name });
    if (!result.ok) {
      if (result.error === "INVALID_GRADE") {
        return NextResponse.json({ error: "Grade not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "A subject with this name already exists for this grade" }, { status: 409 });
    }

    return NextResponse.json(result.subject, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
