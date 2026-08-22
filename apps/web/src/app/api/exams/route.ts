import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listExams, createExam } from "@/lib/exams";
import { resolveAcademicYear } from "@/lib/academic-years";

export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["teacher", "admin"]);
    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }
    const exams = await listExams(prisma, claims.schoolId, yearResult.academicYear.id);
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
    const claims = await requireApiRole(["admin"]);

    let name: string | undefined;
    let term: string | undefined;
    let examDate: string | undefined;
    let maxMarks: number | undefined;
    let passMarks: number | undefined;
    let weightage: number | undefined;
    try {
      ({ name, term, examDate, maxMarks, passMarks, weightage } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (
      !name ||
      !term ||
      !examDate ||
      maxMarks === undefined ||
      maxMarks === null ||
      passMarks === undefined ||
      passMarks === null
    ) {
      return NextResponse.json(
        { error: "name, term, examDate, maxMarks, and passMarks are required" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await createExam(prisma, claims.schoolId, yearResult.academicYear.id, {
      name,
      term,
      examDate,
      maxMarks,
      passMarks,
      weightage,
    });

    if (!result.ok) {
      if (result.error === "INVALID_MAX_MARKS") {
        return NextResponse.json({ error: "maxMarks must be greater than 0" }, { status: 400 });
      }
      return NextResponse.json(
        { error: "passMarks must be between 0 and maxMarks" },
        { status: 400 }
      );
    }

    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
