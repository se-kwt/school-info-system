import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { readFile, rm } from "fs/promises";
import path from "path";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { POST as postAssignmentUpload } from "../src/app/api/assignments/upload/route";

describe("/api/assignments/upload", () => {
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "assignments");

  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterEach(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsTeacher(schoolId: number) {
    const teacher = await prisma.user.create({
      data: { phone: "+15559991001", role: "teacher", name: "Test Teacher", schoolId },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("saves a valid PDF upload and returns attachmentUrl/attachmentName", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsTeacher(school.id);

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "Worksheet_Ch4.pdf", {
      type: "application/pdf",
    });
    formData.append("file", file);

    const request = new Request("http://localhost/api/assignments/upload", {
      method: "POST",
      body: formData,
    });
    const response = await postAssignmentUpload(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.attachmentUrl).toMatch(/^\/uploads\/assignments\/[\w-]+\.pdf$/);
    expect(body.attachmentName).toBe("Worksheet_Ch4.pdf");

    const savedBytes = await readFile(path.join(process.cwd(), "public", body.attachmentUrl));
    expect(savedBytes.length).toBe(4);
  });

  it("saves a valid image upload", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsTeacher(school.id);

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], "diagram.png", { type: "image/png" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/assignments/upload", {
      method: "POST",
      body: formData,
    });
    const response = await postAssignmentUpload(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachmentUrl).toMatch(/^\/uploads\/assignments\/[\w-]+\.png$/);
  });

  it("rejects a non-allowed content type with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsTeacher(school.id);

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], "notes.txt", { type: "text/plain" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/assignments/upload", {
      method: "POST",
      body: formData,
    });
    const response = await postAssignmentUpload(request);
    expect(response.status).toBe(400);
  });

  it("rejects a file over the 2MB size limit with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsTeacher(school.id);

    const formData = new FormData();
    const oversized = new Uint8Array(2 * 1024 * 1024 + 1);
    const file = new File([oversized], "big.pdf", { type: "application/pdf" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/assignments/upload", {
      method: "POST",
      body: formData,
    });
    const response = await postAssignmentUpload(request);
    expect(response.status).toBe(400);
  });

  it("rejects a non-teacher with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const admin = await prisma.user.create({
      data: { phone: "+15559991002", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], "notes.pdf", { type: "application/pdf" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/assignments/upload", {
      method: "POST",
      body: formData,
    });
    const response = await postAssignmentUpload(request);
    expect(response.status).toBe(403);
  });
});
