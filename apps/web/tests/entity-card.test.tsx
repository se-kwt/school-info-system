// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Layers } from "lucide-react";
import { EntityCard } from "../src/components/school-setup/EntityCard";

describe("EntityCard", () => {
  afterEach(() => cleanup());

  it("renders title as a link, subtitle, tagLine, and footer badge", () => {
    render(
      <EntityCard
        icon={Layers}
        href="/dashboard/grades/1"
        title="Grade 1"
        subtitle="6 Subjects • 2 Classes"
        tagLine="English, Math, Science"
        footerBadge="Classes 2"
        onEdit={vi.fn()}
        menuItems={[]}
      />
    );
    expect(screen.getByRole("link", { name: "Grade 1" })).toHaveAttribute("href", "/dashboard/grades/1");
    expect(screen.getByText("6 Subjects • 2 Classes")).toBeInTheDocument();
    expect(screen.getByText("English, Math, Science")).toBeInTheDocument();
    expect(screen.getByText("Classes 2")).toBeInTheDocument();
  });

  it("calls onEdit when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(
      <EntityCard
        icon={Layers}
        href="/dashboard/grades/1"
        title="Grade 1"
        subtitle="6 Subjects • 2 Classes"
        onEdit={onEdit}
        menuItems={[]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("shows the blocked banner instead of the footer when blockedMessage is set", () => {
    render(
      <EntityCard
        icon={Layers}
        href="/dashboard/grades/1"
        title="Grade 1"
        subtitle="6 Subjects • 2 Classes"
        footerBadge="Classes 2"
        onEdit={vi.fn()}
        menuItems={[]}
        blockedMessage="Grade 1 has subjects or classes and cannot be deleted."
        blockedActions={<button type="button">Cancel</button>}
      />
    );
    expect(screen.getByText("Grade 1 has subjects or classes and cannot be deleted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByText("Classes 2")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
