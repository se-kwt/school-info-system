import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { activateStaff } from "@/lib/school-setup/staff";

export async function PATCH(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const claims = await requireApiRole(["admin"]);
    const userId = Number(params.id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
    const result = await activateStaff(prisma, {
      userId,
      schoolId: claims.schoolId,
      academicYearId: activeYear?.id ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
