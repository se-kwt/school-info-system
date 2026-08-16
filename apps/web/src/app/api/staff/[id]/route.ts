import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { getActiveAcademicYear } from "@/lib/academic-years";
import { deleteStaff, editStaff } from "@/lib/school-setup/staff";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["admin"]);
    const userId = Number(params.id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    let body: {
      name?: string;
      phone?: string;
      role?: "teacher" | "admin" | "accountant";
      classId?: number | null;
      subjectId?: number | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const activeYear = await getActiveAcademicYear(prisma, claims.schoolId);
    const result = await editStaff(prisma, {
      userId,
      schoolId: claims.schoolId,
      academicYearId: activeYear?.id ?? null,
      fields: body,
    });

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      }
      if (result.error === "DUPLICATE_PHONE") {
        return NextResponse.json({ error: "This phone number is already registered" }, { status: 409 });
      }
      if (result.error === "INVALID_PHONE") {
        return NextResponse.json({ error: "This phone number is not valid" }, { status: 400 });
      }
      if (result.error === "INVALID_CLASS") {
        return NextResponse.json({ error: "The selected class does not exist" }, { status: 400 });
      }
      if (result.error === "INVALID_SUBJECT") {
        return NextResponse.json({ error: "This subject does not belong to the class's grade" }, { status: 400 });
      }
      if (result.error === "ROLE_CLASS_MISMATCH") {
        return NextResponse.json({ error: "Only a teacher can have a class assignment" }, { status: 400 });
      }
      if (result.error === "SUBJECT_REQUIRED") {
        return NextResponse.json({ error: "subjectId is required when assigning a class" }, { status: 400 });
      }
      return NextResponse.json({ error: "No active academic year is configured" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["admin"]);
    const userId = Number(params.id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const result = await deleteStaff(prisma, {
      userId,
      schoolId: claims.schoolId,
      requestingUserId: claims.userId,
    });

    if (!result.ok) {
      if (result.error === "SELF") {
        return NextResponse.json({ error: "You cannot delete your own account" }, { status: 403 });
      }
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "This staff member has recorded activity and cannot be deleted", deletable: false },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
