import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getMarksForClassExam } from "@/lib/marks";

export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);

    const { searchParams } = new URL(request.url);
    const classIdParam = searchParams.get("classId");
    const examIdParam = searchParams.get("examId");
    if (!classIdParam || !examIdParam) {
      return NextResponse.json({ error: "classId and examId are required" }, { status: 400 });
    }
    const classId = Number(classIdParam);
    const examId = Number(examIdParam);
    if (Number.isNaN(classId) || Number.isNaN(examId)) {
      return NextResponse.json({ error: "classId and examId are required" }, { status: 400 });
    }

    const result = await getMarksForClassExam(prisma, {
      classId,
      examId,
      schoolId: claims.schoolId,
      role: claims.role,
      userId: claims.userId,
    });

    if (!result.ok) {
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      return NextResponse.json({ error: "The selected exam does not exist" }, { status: 400 });
    }

    return NextResponse.json({ subjects: result.subjects, students: result.students });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
