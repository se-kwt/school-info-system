// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComingSoonPage } from "../src/components/dashboard/ComingSoonPage";

describe("ComingSoonPage", () => {
  it("renders the given title and description with a coming-soon badge", () => {
    render(<ComingSoonPage title="Subjects" description="A dedicated subjects catalog is coming soon." />);
    expect(screen.getByRole("heading", { name: "Subjects" })).toBeInTheDocument();
    expect(screen.getByText("A dedicated subjects catalog is coming soon.")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
});
