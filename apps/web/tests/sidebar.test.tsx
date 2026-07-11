// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "../src/components/dashboard/Sidebar";

const navItems = [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" as const }];
const workspaceItems = [{ href: "/dashboard/notifications", label: "Notifications", icon: "Bell" as const }];

describe("Sidebar", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("renders expanded by default with nav labels visible", () => {
    render(
      <Sidebar
        navItems={navItems}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
      />
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Jane Admin")).toBeInTheDocument();
  });

  it("collapses to icon-only when the toggle is clicked, hiding labels", async () => {
    render(
      <Sidebar
        navItems={navItems}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Jane Admin")).not.toBeInTheDocument();
  });

  it("persists the collapsed state to localStorage and restores it on remount", async () => {
    const { unmount } = render(
      <Sidebar
        navItems={navItems}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    unmount();

    render(
      <Sidebar
        navItems={navItems}
        workspaceItems={workspaceItems}
        pinnedClasses={[]}
        userName="Jane Admin"
        userInitials="JA"
        userRole="admin"
      />
    );
    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });
});
