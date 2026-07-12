// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "../src/components/school-setup/Field";

describe("Field", () => {
  it("renders a visible label linked to its input via htmlFor/id", () => {
    render(
      <Field label="First name" htmlFor="firstName">
        <input id="firstName" aria-label="First name" />
      </Field>
    );
    const label = screen.getByText("First name");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "firstName");
    expect(screen.getByLabelText("First name")).toHaveAttribute("id", "firstName");
  });

  it("applies an optional className to the wrapper for grid-span overrides", () => {
    render(
      <Field label="Notes" htmlFor="notes" className="col-span-2">
        <input id="notes" aria-label="Notes" />
      </Field>
    );
    expect(screen.getByText("Notes").parentElement).toHaveClass("col-span-2");
  });
});
