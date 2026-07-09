import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { deactivateStaff } from "@/lib/school-setup/staff";

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);
    const userId = Number(params.id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
    const result = await deactivateStaff(prisma, {
      userId,
      schoolId: claims.schoolId,
      requestingUserId: claims.userId,
      academicYearId: activeYear?.id ?? null,
    });

    if (!result.ok) {
      if (result.error === "SELF") {
        return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 403 });
      }
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
