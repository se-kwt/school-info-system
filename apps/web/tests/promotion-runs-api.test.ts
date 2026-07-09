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
import { POST as postPromotionRuns } from "../src/app/api/promotion-runs/route";
import {
  PUT as putMappings,
} from "../src/app/api/promotion-runs/[id]/mappings/route";
import { GET as getRoster } from "../src/app/api/promotion-runs/[id]/roster/route";
import { PUT as putDecisions } from "../src/app/api/promotion-runs/[id]/decisions/route";
import { GET as getSummary } from "../src/app/api/promotion-runs/[id]/summary/route";
import { POST as postConfirm } from "../src/app/api/promotion-runs/[id]/confirm/route";
import { POST as postRevert } from "../src/app/api/promotion-runs/[id]/revert/route";

describe("/api/promotion-runs", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.get.mockReset();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  function loginAs(userId: number, role: "admin" | "teacher", schoolId: number) {
    const token = signSessionToken({ userId, role, schoolId });
    cookieStore.get.mockReturnValue({ value: token });
  }

  async function seedSchoolReadyForPromotion() {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const fromYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026-27",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2027-04-30"),
        status: "active",
      },
    });
    const toYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027-28",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2028-04-30"),
        status: "upcoming",
      },
    });
    const admin = await prisma.user.create({
      data: { phone: "+15550951111", role: "admin", name: "Test Admin", schoolId: school.id },
    });
    const gradeOne = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 1", section: "A" },
    });
    const gradeTwo = await prisma.class.create({
      data: { schoolId: school.id, name: "Grade 2", section: "A" },
    });
    const student = await prisma.student.create({
      data: { schoolId: school.id, name: "Test Student", dob: new Date("2016-01-01"), admissionNo: "SCH-API1" },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: gradeOne.id, academicYearId: fromYear.id, status: "active" },
    });
    return { school, fromYear, toYear, admin, gradeOne, gradeTwo, student };
  }

  it("creates a draft run", async () => {
    const { school, toYear, admin } = await seedSchoolReadyForPromotion();
    loginAs(admin.id, "admin", school.id);

    const request = new Request("http://localhost/api/promotion-runs", {
      method: "POST",
      body: JSON.stringify({ toAcademicYearId: toYear.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postPromotionRuns(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBeTypeOf("number");
  });

  it("rejects a teacher with 403", async () => {
    const { school, toYear, admin } = await seedSchoolReadyForPromotion();
    const teacher = await prisma.user.create({
      data: { phone: "+15550952222", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });
    void admin;
    loginAs(teacher.id, "teacher", school.id);

    const request = new Request("http://localhost/api/promotion-runs", {
      method: "POST",
      body: JSON.stringify({ toAcademicYearId: toYear.id }),
      headers: { "content-type": "application/json" },
    });
    const response = await postPromotionRuns(request);
    expect(response.status).toBe(403);
  });
  it("runs the full wizard lifecycle: create, map, review, decide, confirm, revert", async () => {
    const { school, fromYear, toYear, admin, gradeOne, gradeTwo, student } =
      await seedSchoolReadyForPromotion();
    loginAs(admin.id, "admin", school.id);

    const createRequest = new Request("http://localhost/api/promotion-runs", {
      method: "POST",
      body: JSON.stringify({ toAcademicYearId: toYear.id }),
      headers: { "content-type": "application/json" },
    });
    const createResponse = await postPromotionRuns(createRequest);
    const { id: runId } = await createResponse.json();

    const mappingsRequest = new Request(`http://localhost/api/promotion-runs/${runId}/mappings`, {
      method: "PUT",
      body: JSON.stringify({ mappings: [{ fromClassId: gradeOne.id, toClassId: gradeTwo.id }] }),
      headers: { "content-type": "application/json" },
    });
    expect((await putMappings(mappingsRequest, { params: { id: String(runId) } })).status).toBe(200);

    const rosterResponse = await getRoster(
      new Request(`http://localhost/api/promotion-runs/${runId}/roster`),
      { params: { id: String(runId) } }
    );
    expect(rosterResponse.status).toBe(200);
    const rosterBody = await rosterResponse.json();
    expect(rosterBody.classes[0].students[0]).toMatchObject({
      studentId: student.id,
      action: "promoted",
      toClassId: gradeTwo.id,
    });

    const decisionsRequest = new Request(`http://localhost/api/promotion-runs/${runId}/decisions`, {
      method: "PUT",
      body: JSON.stringify({ decisions: [{ studentId: student.id, action: "retained" }] }),
      headers: { "content-type": "application/json" },
    });
    expect((await putDecisions(decisionsRequest, { params: { id: String(runId) } })).status).toBe(200);

    const summaryResponse = await getSummary(
      new Request(`http://localhost/api/promotion-runs/${runId}/summary`),
      { params: { id: String(runId) } }
    );
    const summaryBody = await summaryResponse.json();
    expect(summaryBody.counts.retained).toBe(1);
    expect(summaryBody.undecidedStudentIds).toEqual([]);

    const confirmResponse = await postConfirm(
      new Request(`http://localhost/api/promotion-runs/${runId}/confirm`, { method: "POST" }),
      { params: { id: String(runId) } }
    );
    expect(confirmResponse.status).toBe(200);

    const activeYear = await prisma.academicYear.findUnique({ where: { id: toYear.id } });
    expect(activeYear?.status).toBe("active");

    const revertResponse = await postRevert(
      new Request(`http://localhost/api/promotion-runs/${runId}/revert`, { method: "POST" }),
      { params: { id: String(runId) } }
    );
    expect(revertResponse.status).toBe(200);

    const revertedFromYear = await prisma.academicYear.findUnique({ where: { id: fromYear.id } });
    expect(revertedFromYear?.status).toBe("active");
  });
});
