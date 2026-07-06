import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listTimetableEntries, createTimetableEntry } from "@/lib/timetable";

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

    const result = await listTimetableEntries(prisma, {
      classId,
      schoolId: claims.schoolId,
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
    let period: number | undefined;
    let subject: string | undefined;
    let teacherUserId: number | undefined;
    try {
      ({ classId, dayOfWeek, period, subject, teacherUserId } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!classId || dayOfWeek === undefined || period === undefined || !subject) {
      return NextResponse.json(
        { error: "classId, dayOfWeek, period, and subject are required" },
        { status: 400 }
      );
    }

    const result = await createTimetableEntry(prisma, {
      schoolId: claims.schoolId,
      classId,
      dayOfWeek,
      period,
      subject,
      teacherUserId,
    });

    if (!result.ok) {
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      if (result.error === "INVALID_DAY") {
        return NextResponse.json({ error: "dayOfWeek must be between 1 and 6" }, { status: 400 });
      }
      if (result.error === "INVALID_TEACHER") {
        return NextResponse.json(
          { error: "The selected teacher does not exist at this school" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "A period already exists for this class, day, and period number" },
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
