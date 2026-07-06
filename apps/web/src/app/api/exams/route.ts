import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listExams, createExam } from "@/lib/exams";

export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);
    const exams = await listExams(prisma, claims.schoolId);
    return NextResponse.json({ exams });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["admin"]);

    let name: string | undefined;
    let term: string | undefined;
    let examDate: string | undefined;
    try {
      ({ name, term, examDate } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !term || !examDate) {
      return NextResponse.json(
        { error: "name, term, and examDate are required" },
        { status: 400 }
      );
    }

    const result = await createExam(prisma, claims.schoolId, { name, term, examDate });
    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
