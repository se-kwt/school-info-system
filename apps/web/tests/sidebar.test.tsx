// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let mockPathname = "/dashboard/grades";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

import { Sidebar } from "../src/components/dashboard/Sidebar";
import type { NavSection } from "../src/lib/dashboard/nav-items";

const baseSections: NavSection[] = [
  { label: "Main Menu", items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" }] },
];

function sidebarElement(sections: NavSection[]) {
  return (
    <Sidebar
      sections={sections}
      pinnedClasses={[]}
      userName="Jane Admin"
      userInitials="JA"
      userRole="admin"
      schoolName="Test School"
      schoolLogoUrl={null}
    />
  );
}

function renderSidebar(sections: NavSection[] = baseSections) {
  return render(sidebarElement(sections));
}

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPathname = "/dashboard/grades";
  });
  afterEach(() => cleanup());

  it("renders expanded by default with section headers and nav labels visible", () => {
    renderSidebar();
    expect(screen.getByText("Main Menu")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Jane Admin")).toBeInTheDocument();
  });

  it("collapses to icon-only when the toggle is clicked, hiding labels and section headers", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByText("Main Menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Jane Admin")).not.toBeInTheDocument();
  });

  it("persists the collapsed state to localStorage and restores it on remount", async () => {
    const { unmount } = renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    unmount();

    renderSidebar();
    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("marks a top-level leaf matching the current pathname as active", () => {
    mockPathname = "/dashboard/academic-calendar";
    renderSidebar([
      {
        label: "Main Menu",
        items: [
          { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
          { href: "/dashboard/academic-calendar", label: "Academic Calendar", icon: "CalendarDays" },
        ],
      },
    ]);
    expect(screen.getByRole("link", { name: "Academic Calendar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("does not mark a leaf active when the pathname doesn't match", () => {
    mockPathname = "/dashboard/other";
    renderSidebar([
      { label: "Main Menu", items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" }] },
    ]);
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("renders a group collapsed by default, hiding its children", () => {
    mockPathname = "/dashboard/other";
    renderSidebar([
      {
        label: "Academic",
        items: [
          {
            label: "Timetable",
            icon: "CalendarClock",
            children: [
              { href: "/dashboard/timetable", label: "Class Timetable" },
              { href: "/dashboard/timetable/teacher", label: "Teacher Timetable" },
            ],
          },
        ],
      },
    ]);
    expect(screen.getByRole("button", { name: /Timetable/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Class Timetable")).not.toBeInTheDocument();
  });

  it("expands a group and shows its children when the group button is clicked", async () => {
    mockPathname = "/dashboard/other";
    renderSidebar([
      {
        label: "Academic",
        items: [
          {
            label: "Timetable",
            icon: "CalendarClock",
            children: [{ href: "/dashboard/timetable", label: "Class Timetable" }],
          },
        ],
      },
    ]);
    await userEvent.click(screen.getByRole("button", { name: /Timetable/ }));
    expect(screen.getByRole("link", { name: "Class Timetable" })).toBeInTheDocument();
  });

  it("auto-expands a group whose child matches the current pathname", () => {
    mockPathname = "/dashboard/timetable/teacher";
    renderSidebar([
      {
        label: "Academic",
        items: [
          {
            label: "Timetable",
            icon: "CalendarClock",
            children: [
              { href: "/dashboard/timetable", label: "Class Timetable" },
              { href: "/dashboard/timetable/teacher", label: "Teacher Timetable" },
            ],
          },
        ],
      },
    ]);
    expect(screen.getByRole("link", { name: "Teacher Timetable" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Timetable/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("flattens a group's children into plain icon links (with tooltips) when the sidebar is collapsed", async () => {
    mockPathname = "/dashboard/other";
    renderSidebar([
      {
        label: "Academic",
        items: [
          {
            label: "Timetable",
            icon: "CalendarClock",
            children: [{ href: "/dashboard/timetable", label: "Class Timetable" }],
          },
        ],
      },
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByTitle("Class Timetable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Timetable/ })).not.toBeInTheDocument();
  });

  it("marks only the first of two sibling leaves that share an href as active", () => {
    mockPathname = "/dashboard/marks";
    renderSidebar([
      {
        label: "Progress",
        items: [
          {
            label: "Exams & Marks",
            icon: "Award",
            children: [
              { href: "/dashboard/marks", label: "Exams" },
              { href: "/dashboard/marks", label: "Marks" },
            ],
          },
        ],
      },
    ]);
    // The group auto-expands because one of its children matches the pathname.
    expect(screen.getByRole("link", { name: "Exams" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Marks" })).not.toHaveAttribute("aria-current");
  });

  it("expands a newly-active group after a client-side navigation (no unmount), without collapsing a group the user expanded manually", async () => {
    mockPathname = "/dashboard/other";
    const sections: NavSection[] = [
      {
        label: "Academic",
        items: [
          {
            label: "Grades",
            icon: "Layers",
            children: [
              { href: "/dashboard/grades", label: "All Grades" },
              { href: "/dashboard/grades/add", label: "Add Grade" },
            ],
          },
          {
            label: "Classes",
            icon: "Building2",
            children: [
              { href: "/dashboard/classes", label: "All Classes" },
              { href: "/dashboard/classes/add", label: "Add Class" },
            ],
          },
        ],
      },
    ];

    const { rerender } = renderSidebar(sections);

    // Neither group's child matches the pathname yet, so both start collapsed.
    expect(screen.getByRole("button", { name: /Grades/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Classes/ })).toHaveAttribute("aria-expanded", "false");

    // The user manually expands "Classes" (unrelated to the upcoming navigation).
    await userEvent.click(screen.getByRole("button", { name: /Classes/ }));
    expect(screen.getByRole("button", { name: /Classes/ })).toHaveAttribute("aria-expanded", "true");

    // Simulate a client-side navigation to a "Grades" child -- the pathname
    // changes but Sidebar does NOT unmount (rerender, not a fresh render).
    mockPathname = "/dashboard/grades/add";
    rerender(sidebarElement(sections));

    expect(screen.getByRole("link", { name: "Add Grade" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Grades/ })).toHaveAttribute("aria-expanded", "true");
    // "Classes" stays expanded -- the update only adds, never removes.
    expect(screen.getByRole("button", { name: /Classes/ })).toHaveAttribute("aria-expanded", "true");
  });
});
