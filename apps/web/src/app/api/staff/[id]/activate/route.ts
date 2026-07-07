import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { activateStaff } from "@/lib/school-setup/staff";

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = requireApiRole(["admin"]);
    const userId = Number(params.id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const result = await activateStaff(prisma, { userId, schoolId: claims.schoolId });
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
