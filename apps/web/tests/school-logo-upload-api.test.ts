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
import { POST as postSchoolLogo } from "../src/app/api/school/logo/route";

describe("/api/school/logo", () => {
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "school");

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

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15559990010", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("saves a valid PNG upload, updates School.logoUrl, and returns it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "logo.png", { type: "image/png" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/school/logo", {
      method: "POST",
      body: formData,
    });
    const response = await postSchoolLogo(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.logoUrl).toMatch(/^\/uploads\/school\/[\w-]+\.png$/);

    const savedBytes = await readFile(path.join(process.cwd(), "public", body.logoUrl));
    expect(savedBytes.length).toBe(4);

    const updated = await prisma.school.findUniqueOrThrow({ where: { id: school.id } });
    expect(updated.logoUrl).toBe(body.logoUrl);
  });

  it("rejects a non-image content type with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], "notes.txt", { type: "text/plain" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/school/logo", {
      method: "POST",
      body: formData,
    });
    const response = await postSchoolLogo(request);
    expect(response.status).toBe(400);
  });

  it("rejects a file over the 2MB size limit with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const formData = new FormData();
    const oversized = new Uint8Array(2 * 1024 * 1024 + 1);
    const file = new File([oversized], "big.png", { type: "image/png" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/school/logo", {
      method: "POST",
      body: formData,
    });
    const response = await postSchoolLogo(request);
    expect(response.status).toBe(400);
  });

  it("rejects a teacher (non-admin) with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15559990011", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const formData = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
    formData.append("file", file);

    const request = new Request("http://localhost/api/school/logo", {
      method: "POST",
      body: formData,
    });
    const response = await postSchoolLogo(request);
    expect(response.status).toBe(403);
  });
});
