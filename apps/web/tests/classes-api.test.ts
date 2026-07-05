import { vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { signSessionToken } from "../src/lib/auth/jwt";
import { GET as getClasses, POST as postClasses } from "../src/app/api/classes/route";

describe("/api/classes", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(schoolId: number) {
    const admin = await prisma.user.create({
      data: { phone: "+15551110000", role: "admin", name: "Test Admin", schoolId },
    });
    const token = signSessionToken({ userId: admin.id, role: "admin", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("creates a class and lists it", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6", section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(201);
    const created = await postResponse.json();
    expect(created).toMatchObject({ name: "Grade 6", section: "B" });

    const getResponse = await getClasses();
    expect(getResponse.status).toBe(200);
    const list = await getResponse.json();
    expect(list).toEqual([{ id: created.id, name: "Grade 6", section: "B" }]);
  });

  it("rejects a duplicate name+section with 409", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);
    await prisma.class.create({ data: { schoolId: school.id, name: "Grade 6", section: "B" } });

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6", section: "B" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(409);
  });

  it("rejects a missing field with 400", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await loginAsAdmin(school.id);

    const postRequest = new Request("http://localhost/api/classes", {
      method: "POST",
      body: JSON.stringify({ name: "Grade 6" }),
      headers: { "content-type": "application/json" },
    });
    const postResponse = await postClasses(postRequest);
    expect(postResponse.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const getResponse = await getClasses();
    expect(getResponse.status).toBe(401);
  });

  it("rejects a non-admin role with 403", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const teacher = await prisma.user.create({
      data: { phone: "+15552220000", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    const token = signSessionToken({ userId: teacher.id, role: "teacher", schoolId: school.id });
    cookieStore.get.mockReturnValue({ value: token });

    const getResponse = await getClasses();
    expect(getResponse.status).toBe(403);
  });
});
