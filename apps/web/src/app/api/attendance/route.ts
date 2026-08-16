import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getAttendanceRoster, markAttendance } from "@/lib/attendance";
import { resolveAcademicYear } from "@/lib/academic-years";

export async function GET(request: Request) {
  try {
    const claims = await requireApiRole(["teacher", "admin"]);

    const { searchParams } = new URL(request.url);
    const classIdParam = searchParams.get("classId");
    const date = searchParams.get("date");

    if (!classIdParam || !date) {
      return NextResponse.json({ error: "classId and date are required" }, { status: 400 });
    }
    const classId = Number(classIdParam);
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: "classId and date are required" }, { status: 400 });
    }

    const yearResult = await resolveAcademicYear(prisma, claims.schoolId);
    if (!yearResult.ok) {
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    const result = await getAttendanceRoster(prisma, {
      classId,
      date,
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

    return NextResponse.json({ students: result.students });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const claims = await requireApiRole(["teacher", "admin"]);

    let classId: number | undefined;
    let date: string | undefined;
    let entries: Array<{ studentId: number; status: string | null; note?: string }> | undefined;
    try {
      ({ classId, date, entries } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || !date || !entries || entries.length === 0) {
      return NextResponse.json(
        { error: "classId, date, and entries are required" },
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

    const result = await markAttendance(prisma, {
      classId,
      date,
      academicYearId: yearResult.academicYear.id,
      schoolId: claims.schoolId,
      teacherUserId: claims.userId,
      role: claims.role,
      entries: entries as Array<{
        studentId: number;
        status: "present" | "absent" | "late" | null;
        note?: string;
      }>,
    });

    if (!result.ok) {
      if (result.error === "NOT_ASSIGNED") {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
      if (result.error === "DATE_LOCKED") {
        return NextResponse.json(
          { error: "Teachers can only edit today's attendance" },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "One or more students do not belong to this class" },
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
