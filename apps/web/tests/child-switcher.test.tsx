// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChildSwitcher } from "../src/components/parent/ChildSwitcher";

describe("ChildSwitcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when there is only one child", () => {
    const { container } = render(
      <ChildSwitcher students={[{ id: 1, name: "Rohan Sharma" }]} activeStudentId={1} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a chip per child and marks the active one, linking by studentId", () => {
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
});
