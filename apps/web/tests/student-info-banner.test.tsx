// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StudentInfoBanner } from "../src/components/parent/StudentInfoBanner";

describe("StudentInfoBanner", () => {
  afterEach(() => cleanup());

  it("shows the student's name and class/section", () => {
    render(<StudentInfoBanner name="Rohan Sharma" className="Grade 5 A" />);
    expect(screen.getByText("Rohan Sharma")).toBeInTheDocument();
    expect(screen.getByText("Grade 5 A")).toBeInTheDocument();
  });

  it("omits the class/section line when className is null", () => {
    render(<StudentInfoBanner name="Rohan Sharma" className={null} />);
    expect(screen.getByText("Rohan Sharma")).toBeInTheDocument();
    expect(screen.queryByText("Grade 5 A")).not.toBeInTheDocument();
  });
});
