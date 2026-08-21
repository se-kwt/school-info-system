// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Layers } from "lucide-react";
import { PageHeader } from "../src/components/school-setup/PageHeader";

describe("PageHeader", () => {
  afterEach(() => cleanup());

  it("renders the icon, title, subtitle, and action", () => {
    render(
      <PageHeader
        icon={Layers}
        title="Grades"
        subtitle="Manage and organize all grades in your school"
        action={<button type="button">+ Create Grade</button>}
      />
    );
    expect(screen.getByRole("heading", { name: "Grades" })).toBeInTheDocument();
    expect(screen.getByText("Manage and organize all grades in your school")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create Grade" })).toBeInTheDocument();
  });
});
