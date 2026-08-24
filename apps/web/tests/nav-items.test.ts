import { describe, it, expect } from "vitest";
import { getNavItemsForRole, WORKSPACE_NAV_ITEMS } from "../src/lib/dashboard/nav-items";

// The dashboard layout renders `getNavItemsForRole(role)` and
// `WORKSPACE_NAV_ITEMS` as two separate lists in the sidebar (see
// src/app/dashboard/layout.tsx), not merged into one array. So "every nav
// entry offered to a role" means the union of both.
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
