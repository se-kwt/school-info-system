import { describe, it, expect } from "vitest";
import { getNavItemsForRole, WORKSPACE_NAV_ITEMS } from "../src/lib/dashboard/nav-items";

describe("getNavItemsForRole", () => {
  it("returns six items for teacher, excluding Classes, Staff, and Fees", () => {
    const items = getNavItemsForRole("teacher");
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/students",
      "/dashboard/attendance",
      "/dashboard/assignments",
      "/dashboard/marks",
      "/dashboard/timetable",
    ]);
  });

  it("returns all thirteen items for admin, including Classes, Staff, Grades, Periods, Academic Years, and Promotion", () => {
    const items = getNavItemsForRole("admin");
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/grades",
      "/dashboard/classes",
      "/dashboard/staff",
      "/dashboard/students",
      "/dashboard/attendance",
      "/dashboard/assignments",
      "/dashboard/marks",
      "/dashboard/periods",
      "/dashboard/timetable",
      "/dashboard/fees",
      "/dashboard/academic-years",
      "/dashboard/academic-years/promote",
    ]);
  });

  it("returns only Dashboard and Fees for accountant", () => {
    const items = getNavItemsForRole("accountant");
    expect(items.map((item) => item.href)).toEqual(["/dashboard", "/dashboard/fees"]);
  });

  it("returns an empty list for parent", () => {
    expect(getNavItemsForRole("parent")).toEqual([]);
  });

  it("exposes two Workspace routes with icons", () => {
    const items = WORKSPACE_NAV_ITEMS;
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard/notifications",
      "/dashboard/settings",
    ]);
    for (const item of items) {
      expect(item.icon).toBeDefined();
    }
  });
});

// The dashboard layout renders `getNavItemsForRole(role)` and
// `WORKSPACE_NAV_ITEMS` as two separate lists in the sidebar (see
// src/app/dashboard/layout.tsx), not merged into one array. So "every nav
// entry offered to a role" means the union of both. These tests cover that
// union-level guarantee; the exact-list tests above cover each list's own
// precise, ordered contents.
function allHrefsForRole(role: "admin" | "teacher" | "accountant"): string[] {
  return [...getNavItemsForRole(role), ...WORKSPACE_NAV_ITEMS].map((i) => i.href);
}

describe("nav-items", () => {
  it("offers no navigation entry that leads to a placeholder", () => {
    for (const role of ["admin", "teacher", "accountant"] as const) {
      const hrefs = allHrefsForRole(role);
      expect(hrefs).not.toContain("/dashboard/reports");
      expect(hrefs).not.toContain("/dashboard/resources");
    }
  });

  it("still offers notifications and settings to every dashboard role", () => {
    for (const role of ["admin", "teacher", "accountant"] as const) {
      const hrefs = allHrefsForRole(role);
      expect(hrefs).toContain("/dashboard/notifications");
      expect(hrefs).toContain("/dashboard/settings");
    }
  });

  it("links the promotion wizard for admins", () => {
    const hrefs = getNavItemsForRole("admin").map((i) => i.href);
    expect(hrefs).toContain("/dashboard/academic-years/promote");
  });
});
