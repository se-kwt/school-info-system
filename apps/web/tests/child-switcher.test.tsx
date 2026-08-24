// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { ChildSwitcher } from "../src/components/parent/ChildSwitcher";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

describe("ChildSwitcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when there is only one child", () => {
    vi.mocked(usePathname).mockReturnValue("/parent");
    const { container } = render(
      <ChildSwitcher students={[{ id: 1, name: "Rohan Sharma" }]} activeStudentId={1} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a chip per child and marks the active one, linking by studentId", () => {
    vi.mocked(usePathname).mockReturnValue("/parent");
    render(
      <ChildSwitcher
        students={[
          { id: 1, name: "Rohan Sharma" },
          { id: 2, name: "Meera Sharma" },
        ]}
        activeStudentId={2}
      />
    );

    const rohanLink = screen.getByRole("link", { name: "Rohan Sharma" });
    const meeraLink = screen.getByRole("link", { name: "Meera Sharma" });

    expect(rohanLink).toHaveAttribute("href", "/parent?studentId=1");
    expect(meeraLink).toHaveAttribute("href", "/parent?studentId=2");
    expect(meeraLink).toHaveAttribute("aria-current", "true");
    expect(rohanLink).not.toHaveAttribute("aria-current");
  });

  it("stays on the attendance section when switching child", () => {
    vi.mocked(usePathname).mockReturnValue("/parent/attendance");

    render(
      <ChildSwitcher
        students={[
          { id: 1, name: "Rohan Sharma" },
          { id: 2, name: "Meera Sharma" },
        ]}
        activeStudentId={1}
      />
    );

    expect(screen.getByRole("link", { name: "Meera Sharma" })).toHaveAttribute(
      "href",
      "/parent/attendance?studentId=2"
    );
  });

  it("stays on a nested section", () => {
    vi.mocked(usePathname).mockReturnValue("/parent/assignments/completed");

    render(
      <ChildSwitcher
        students={[
          { id: 1, name: "Rohan Sharma" },
          { id: 2, name: "Meera Sharma" },
        ]}
        activeStudentId={1}
      />
    );

    expect(screen.getByRole("link", { name: "Meera Sharma" })).toHaveAttribute(
      "href",
      "/parent/assignments/completed?studentId=2"
    );
  });

  it("drops a detail-page id rather than carrying it to another child", () => {
    vi.mocked(usePathname).mockReturnValue("/parent/assignments/42");

    render(
      <ChildSwitcher
        students={[
          { id: 1, name: "Rohan Sharma" },
          { id: 2, name: "Meera Sharma" },
        ]}
        activeStudentId={1}
      />
    );

    expect(screen.getByRole("link", { name: "Meera Sharma" })).toHaveAttribute(
      "href",
      "/parent/assignments?studentId=2"
    );
  });
});
