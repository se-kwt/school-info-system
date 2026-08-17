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
import { GET as getNotifications } from "../src/app/api/notifications/route";
import { POST as markRead } from "../src/app/api/notifications/[id]/read/route";

describe("/api/notifications", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  function loginAsParent(userId: number, schoolId: number) {
    const token = signSessionToken({ userId, role: "parent", schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  it("returns only the caller's notifications, newest first, with an unread count", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const parent = await prisma.user.create({
      data: { phone: "+15550030001", role: "parent", name: "Test Parent", schoolId: school.id },
    });
    const otherParent = await prisma.user.create({
      data: { phone: "+15550030002", role: "parent", name: "Other Parent", schoolId: school.id },
    });
    await prisma.notification.create({
      data: { userId: otherParent.id, type: "assignment_published", title: "Not mine", body: "x" },
    });
    const older = await prisma.notification.create({
      data: { userId: parent.id, type: "assignment_published", title: "Older", body: "x" },
    });
    await prisma.notification.update({
      where: { id: older.id },
      data: { createdAt: new Date("2026-01-01") },
    });
    await prisma.notification.create({
      data: { userId: parent.id, type: "assignment_published", title: "Newer", body: "x" },
    });

    loginAsParent(parent.id, school.id);
    const response = await getNotifications();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.notifications).toHaveLength(2);
    expect(body.notifications[0].title).toBe("Newer");
    expect(body.notifications[1].title).toBe("Older");
    expect(body.unreadCount).toBe(2);
  });

  it("marks a notification as read and excludes it from unreadCount afterward", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const parent = await prisma.user.create({
      data: { phone: "+15550030003", role: "parent", name: "Test Parent", schoolId: school.id },
    });
    const notification = await prisma.notification.create({
      data: { userId: parent.id, type: "assignment_published", title: "Hi", body: "x" },
    });
    loginAsParent(parent.id, school.id);

    const readResponse = await markRead(new Request("http://localhost/api/notifications/1/read", { method: "POST" }), {
      params: Promise.resolve({ id: String(notification.id) }),
    });
    expect(readResponse.status).toBe(200);

    const listResponse = await getNotifications();
    const body = await listResponse.json();
    expect(body.unreadCount).toBe(0);
    expect(body.notifications[0].readAt).not.toBeNull();
  });

  it("returns 404 when marking a notification that belongs to someone else", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const parent = await prisma.user.create({
      data: { phone: "+15550030004", role: "parent", name: "Test Parent", schoolId: school.id },
    });
    const otherParent = await prisma.user.create({
      data: { phone: "+15550030005", role: "parent", name: "Other Parent", schoolId: school.id },
    });
    const notification = await prisma.notification.create({
      data: { userId: otherParent.id, type: "assignment_published", title: "Not yours", body: "x" },
    });
    loginAsParent(parent.id, school.id);

    const response = await markRead(new Request("http://localhost/api/notifications/1/read", { method: "POST" }), {
      params: Promise.resolve({ id: String(notification.id) }),
    });
    expect(response.status).toBe(404);
  });
});
