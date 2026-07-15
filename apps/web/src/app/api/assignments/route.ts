import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listAssignments, createAssignment } from "@/lib/assignments";
import { resolveAcademicYear } from "@/lib/academic-years";

export async function GET(request: Request) {
  try {
    const claims = requireApiRole(["teacher", "admin"]);

    const { searchParams } = new URL(request.url);
    const classIdParam = searchParams.get("classId");
    if (!classIdParam) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }
    const classId = Number(classIdParam);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await listAssignments(prisma, {
      classId,
      schoolId: claims.schoolId,
      role: claims.role,
      userId: claims.userId,
      academicYearId: yearResult.academicYear.id,
    });

    if (!result.ok) {
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
    }

    return NextResponse.json({ assignments: result.assignments });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = requireApiRole(["teacher"]);

    let classId: number | undefined;
    let subjectId: number | undefined;
    let title: string | undefined;
    let description: string | undefined;
    let dueDate: string | undefined;
    let attachmentUrl: string | undefined;
    let attachmentName: string | undefined;
    try {
      ({ classId, subjectId, title, description, dueDate, attachmentUrl, attachmentName } =
        await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || !subjectId || !title || !dueDate) {
      return NextResponse.json(
        { error: "classId, subjectId, title, and dueDate are required" },
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

    const result = await createAssignment(prisma, {
      classId,
      teacherUserId: claims.userId,
      subjectId,
      title,
      description,
      dueDate,
      academicYearId: yearResult.academicYear.id,
      attachmentUrl,
      attachmentName,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "You are not assigned to this class and subject" }, { status: 403 });
    }

    return NextResponse.json({ id: result.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
