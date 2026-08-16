import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { deactivateStudent } from "@/lib/school-setup/students";

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["admin"]);
    const studentId = Number(params.id);
    if (Number.isNaN(studentId)) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
    const result = await deactivateStudent(prisma, {
      studentId,
      schoolId: claims.schoolId,
      academicYearId: activeYear?.id ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
