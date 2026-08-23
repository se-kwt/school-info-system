import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { updateSchoolProfile } from "@/lib/school-setup/school";

export async function PATCH(request: Request) {
  try {
    const claims = await requireApiRole(["admin"]);

    let body: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
      principalName?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = await updateSchoolProfile(prisma, {
      schoolId: claims.schoolId,
      fields: {
        name: body.name,
        address: body.address,
        phone: body.phone,
        email: body.email,
        principalName: body.principalName,
      },
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "School not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "School name cannot be blank" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
