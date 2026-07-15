import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listTimetableEntries, createTimetableEntry } from "@/lib/timetable";
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

    const result = await listTimetableEntries(prisma, {
      classId,
      schoolId: claims.schoolId,
      academicYearId: yearResult.academicYear.id,
      role: claims.role,
      userId: claims.userId,
    });

    if (!result.ok) {
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
    }

    return NextResponse.json({ entries: result.entries });
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

    let classId: number | undefined;
    let dayOfWeek: number | undefined;
    let periodId: number | undefined;
    let subjectId: number | undefined;
    let teacherUserId: number | undefined;
    try {
      ({ classId, dayOfWeek, periodId, subjectId, teacherUserId } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || dayOfWeek === undefined || !periodId || !subjectId) {
      return NextResponse.json(
        { error: "classId, dayOfWeek, periodId, and subjectId are required" },
        { status: 400 }
      );
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await createTimetableEntry(prisma, {
      schoolId: claims.schoolId,
      academicYearId: yearResult.academicYear.id,
      classId,
      dayOfWeek,
      periodId,
      subjectId,
      teacherUserId,
    });

    if (!result.ok) {
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      if (result.error === "INVALID_DAY") {
        return NextResponse.json({ error: "dayOfWeek must be between 1 and 6" }, { status: 400 });
      }
      if (result.error === "INVALID_SUBJECT") {
        return NextResponse.json({ error: "This subject does not belong to the class's grade" }, { status: 400 });
      }
      if (result.error === "INVALID_TEACHER") {
        return NextResponse.json(
          { error: "The selected teacher is not assigned to teach this subject on this class" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "A period already exists for this class, day, and period" },
        { status: 409 }
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
