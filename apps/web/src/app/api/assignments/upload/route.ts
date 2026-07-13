import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { AuthError } from "@/lib/auth/rbac";

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    requireApiRole(["teacher"]);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: "Only PNG, JPEG, WebP, and PDF files are allowed" },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File must be 2MB or smaller" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "assignments");
    await mkdir(uploadsDir, { recursive: true });

    const filename = `${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({
      attachmentUrl: `/uploads/assignments/${filename}`,
      attachmentName: file.name,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
