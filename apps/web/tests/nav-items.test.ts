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

  it("returns all nine items for admin, including Classes and Staff", () => {
    const items = getNavItemsForRole("admin");
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/classes",
      "/dashboard/staff",
      "/dashboard/students",
      "/dashboard/attendance",
      "/dashboard/assignments",
      "/dashboard/marks",
      "/dashboard/timetable",
      "/dashboard/fees",
    ]);
  });

  it("returns only Dashboard and Fees for accountant", () => {
    const items = getNavItemsForRole("accountant");
    expect(items.map((item) => item.href)).toEqual(["/dashboard", "/dashboard/fees"]);
  });

  it("returns an empty list for parent", () => {
    expect(getNavItemsForRole("parent")).toEqual([]);
  });

  it("exposes four Workspace placeholder routes with icons", () => {
    const items = WORKSPACE_NAV_ITEMS;
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard/notifications",
      "/dashboard/reports",
      "/dashboard/resources",
      "/dashboard/settings",
    ]);
    for (const item of items) {
      expect(item.icon).toBeDefined();
    }
  });
});
