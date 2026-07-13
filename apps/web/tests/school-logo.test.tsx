// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SchoolLogo } from "../src/components/SchoolLogo";

describe("SchoolLogo", () => {
  afterEach(() => cleanup());

  it("renders an image when logoUrl is set", () => {
    render(<SchoolLogo logoUrl="/uploads/school/abc.png" schoolName="Greenwood High" />);
    const img = screen.getByRole("img", { name: "Greenwood High" });
    expect(img).toHaveAttribute("src", "/uploads/school/abc.png");
  });

  it("renders initials as a fallback when logoUrl is null", () => {
    render(<SchoolLogo logoUrl={null} schoolName="Greenwood High" />);
    expect(screen.getByText("GH")).toBeInTheDocument();
  });

  it("falls back to a single initial for a one-word school name", () => {
    render(<SchoolLogo logoUrl={null} schoolName="Greenwood" />);
    expect(screen.getByText("G")).toBeInTheDocument();
  });
});
