import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getNavSectionsForRole, type NavSection } from "../src/lib/dashboard/nav-items";

function flattenHrefs(sections: NavSection[]): string[] {
  return sections.flatMap((section) =>
    section.items.flatMap((entry) => ("children" in entry ? entry.children.map((c) => c.href) : [entry.href]))
  );
}

describe("getNavSectionsForRole", () => {
  it("points every href at a page.tsx that actually exists on disk", () => {
    const hrefs = flattenHrefs(getNavSectionsForRole("admin"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const pagePath = join(__dirname, "..", "src", "app", ...href.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(pagePath), `${href} -> ${pagePath}`).toBe(true);
    }
  });

  it("gives admin all nine sections, in order", () => {
    const sections = getNavSectionsForRole("admin");
    expect(sections.map((s) => s.label)).toEqual([
      "Main Menu",
      "Academic",
      "People",
      "Progress",
      "Finance",
      "School Management",
      "Communication",
      "Reports",
      "Workspace",
    ]);
  });

  it("gives admin both All Grades and Add Grade under the Grades group", () => {
    const academic = getNavSectionsForRole("admin").find((s) => s.label === "Academic")!;
    const gradesGroup = academic.items.find((entry) => "children" in entry && entry.label === "Grades");
    expect(gradesGroup).toEqual({
      label: "Grades",
      icon: "Layers",
      children: [
        { href: "/dashboard/grades", label: "All Grades" },
        { href: "/dashboard/grades/add", label: "Add Grade" },
      ],
    });
  });

  it("prunes teacher down to Academic > Timetable > Class Timetable only", () => {
    const sections = getNavSectionsForRole("teacher");
    expect(sections.map((s) => s.label)).toEqual([
      "Main Menu",
      "Academic",
      "People",
      "Progress",
      "Communication",
      "Workspace",
    ]);
    const academic = sections.find((s) => s.label === "Academic")!;
    expect(academic.items).toEqual([
      {
        label: "Timetable",
        icon: "CalendarClock",
        children: [{ href: "/dashboard/timetable", label: "Class Timetable" }],
      },
    ]);
  });

  it("prunes teacher's People section down to Students > All Students only", () => {
    const people = getNavSectionsForRole("teacher").find((s) => s.label === "People")!;
    expect(people.items).toEqual([
      {
        label: "Students",
        icon: "GraduationCap",
        children: [{ href: "/dashboard/students", label: "All Students" }],
      },
    ]);
  });

  it("gives accountant only Dashboard, Finance, Communication, and Workspace", () => {
    const sections = getNavSectionsForRole("accountant");
    expect(sections.map((s) => s.label)).toEqual(["Main Menu", "Finance", "Communication", "Workspace"]);
    const finance = sections.find((s) => s.label === "Finance")!;
    expect(finance.items).toEqual([
      {
        label: "Fees",
        icon: "Wallet",
        children: [
          { href: "/dashboard/fees", label: "Fee Structure" },
          { href: "/dashboard/fees", label: "Fee Collection" },
          { href: "/dashboard/fees/payments", label: "Payments" },
          { href: "/dashboard/fees/outstanding", label: "Outstanding Fees" },
        ],
      },
    ]);
  });

  it("returns nothing for parent, who never reaches the dashboard shell", () => {
    expect(getNavSectionsForRole("parent")).toEqual([]);
  });
});
