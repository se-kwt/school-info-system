import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getMarksForClassExam, enterMarks } from "@/lib/marks";
import { resolveAcademicYear } from "@/lib/academic-years";

export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["teacher", "admin"]);

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

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await getMarksForClassExam(prisma, {
      classId,
      examId,
      schoolId: claims.schoolId,
      academicYearId: yearResult.academicYear.id,
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

export async function POST(request: Request) {
  try {
    const claims = await requireApiRole(["teacher"]);

    let classId: number | undefined;
    let examId: number | undefined;
    let subjectId: number | undefined;
    let maxMarks: number | undefined;
    let entries: Array<{ studentId: number; marksObtained: number }> | undefined;
    try {
      ({ classId, examId, subjectId, maxMarks, entries } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || !examId || !subjectId || !maxMarks || !entries || entries.length === 0) {
      return NextResponse.json(
        { error: "classId, examId, subjectId, maxMarks, and entries are required" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }
    if (yearResult.academicYear.status !== "active") {
      return NextResponse.json(
        { error: "This academic year is archived and no longer accepts changes" },
        { status: 400 }
      );
    }

    const result = await enterMarks(prisma, {
      classId,
      examId,
      subjectId,
      maxMarks,
      teacherUserId: claims.userId,
      schoolId: claims.schoolId,
      academicYearId: yearResult.academicYear.id,
      entries,
    });

    if (!result.ok) {
      if (result.error === "INVALID_EXAM") {
        return NextResponse.json({ error: "The selected exam does not exist" }, { status: 400 });
      }
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json(
          { error: "You are not assigned to this class and subject" },
          { status: 403 }
        );
      }
      if (result.error === "STUDENT_MISMATCH") {
        return NextResponse.json(
          { error: "One or more students do not belong to this class" },
          { status: 400 }
        );
      }
      if (result.error === "INVALID_MAX_MARKS") {
        return NextResponse.json({ error: "maxMarks must be greater than 0" }, { status: 400 });
      }
      return NextResponse.json(
        { error: "marksObtained must be between 0 and maxMarks" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
