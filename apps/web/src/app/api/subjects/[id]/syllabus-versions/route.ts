import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";
import { listSyllabusVersions, createSyllabusVersion } from "@/lib/school-setup/subjects";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["admin", "teacher"]);
    const subjectId = Number(params.id);
    if (Number.isNaN(subjectId)) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    const result = await listSyllabusVersions(prisma, { subjectId, schoolId: claims.schoolId });
    if (!result.ok) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }
    return NextResponse.json(result.versions);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const claims = await requireApiRole(["admin"]);
    const subjectId = Number(params.id);
    if (Number.isNaN(subjectId)) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    let title: string | undefined;
    let content: string | undefined;
    let fileUrl: string | undefined;
    let fileName: string | undefined;
    try {
      ({ title, content, fileUrl, fileName } = await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!title || content === undefined) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    const result = await createSyllabusVersion(prisma, {
      subjectId,
      schoolId: claims.schoolId,
      title,
      content,
      fileUrl,
      fileName,
      createdById: claims.userId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
