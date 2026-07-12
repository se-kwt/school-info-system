// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormSection } from "../src/components/school-setup/FormSection";

describe("FormSection", () => {
  it("renders a heading and its children", () => {
    render(
      <FormSection number={1} title="Student Details">
        <input aria-label="Example field" />
      </FormSection>
    );
    expect(screen.getByRole("heading", { name: "Student Details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Example field")).toBeInTheDocument();
  });

  it("renders a numbered badge", () => {
    render(
      <FormSection number={2} title="Sibling Details">
        <input aria-label="Example field" />
      </FormSection>
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sibling Details" })).toBeInTheDocument();
  });
});
