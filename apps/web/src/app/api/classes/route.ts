import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listClasses, createClass } from "@/lib/school-setup/classes";

export async function GET() {
  try {
    const claims = requireApiRole(["admin"]);
    const classes = await listClasses(prisma, claims.schoolId);
    return NextResponse.json(classes);
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

    let name: string | undefined;
    let section: string | undefined;
    try {
      ({ name, section } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!name || !section) {
      return NextResponse.json({ error: "name and section are required" }, { status: 400 });
    }

    const result = await createClass(prisma, claims.schoolId, { name, section });
    if (!result.ok) {
      return NextResponse.json(
        { error: "A class with this name and section already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(result.class, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
