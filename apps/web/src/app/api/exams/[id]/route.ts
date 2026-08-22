import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { setExamPublished } from "@/lib/exams";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);

    const examId = Number(params.id);
    if (Number.isNaN(examId)) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    let published: unknown;
    try {
      ({ published } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (typeof published !== "boolean") {
      return NextResponse.json({ error: "published must be a boolean" }, { status: 400 });
    }

    const result = await setExamPublished(prisma, {
      examId,
      schoolId: claims.schoolId,
      published,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
