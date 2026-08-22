import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { activateAcademicYear, archiveAcademicYear } from "@/lib/academic-years";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);

    const academicYearId = Number(params.id);
    if (Number.isNaN(academicYearId)) {
      return NextResponse.json({ error: "Academic year not found" }, { status: 404 });
    }

    let action: string | undefined;
    try {
      ({ action } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (action !== "activate" && action !== "archive") {
      return NextResponse.json(
        { error: 'action must be "activate" or "archive"' },
        { status: 400 }
      );
    }

    if (action === "activate") {
      const result = await activateAcademicYear(prisma, {
        academicYearId,
        schoolId: claims.schoolId,
      });
      if (!result.ok) {
        if (result.error === "NOT_FOUND") {
          return NextResponse.json({ error: "Academic year not found" }, { status: 404 });
        }
        return NextResponse.json(
          { error: "An archived year cannot be reactivated" },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true });
    }

    const result = await archiveAcademicYear(prisma, {
      academicYearId,
      schoolId: claims.schoolId,
    });
    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Academic year not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Activate the next year instead — a school must always have one active year" },
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
