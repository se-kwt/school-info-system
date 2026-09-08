// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubjectsView } from "../src/components/school-setup/SubjectsView";

const grades = [
  { id: 1, name: "Grade 1", subjectCount: 2, classCount: 2, subjectNames: ["English", "Math"] },
  { id: 2, name: "Grade 2", subjectCount: 0, classCount: 0, subjectNames: [] },
];

describe("SubjectsView", () => {
  afterEach(() => cleanup());

  it("renders a card per grade linking to its subjects page, with a subject count", () => {
    render(<SubjectsView initialGrades={grades} />);
    expect(screen.getByRole("link", { name: "Grade 1" })).toHaveAttribute("href", "/dashboard/subjects/1");
    expect(screen.getByRole("link", { name: "Grade 2" })).toHaveAttribute("href", "/dashboard/subjects/2");
    expect(screen.getByText("2 Subjects")).toBeInTheDocument();
    expect(screen.getByText("0 Subjects")).toBeInTheDocument();
  });

  it("does not render an actions menu on grade cards", () => {
    render(<SubjectsView initialGrades={grades} />);
    expect(screen.queryByRole("button", { name: "Actions for Grade 1" })).not.toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<SubjectsView initialGrades={grades} />);
    await userEvent.type(screen.getByLabelText("Search grades..."), "Grade 1");
    expect(screen.getByRole("link", { name: "Grade 1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 2" })).not.toBeInTheDocument();
  });

  it("switches to list view and shows the same grades in a table", async () => {
    render(<SubjectsView initialGrades={grades} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Grade 1" })).toBeInTheDocument();
  });

  it("shows an empty state when no grades match the search", async () => {
    render(<SubjectsView initialGrades={grades} />);
    await userEvent.type(screen.getByLabelText("Search grades..."), "nonexistent");
    expect(screen.getByText("No grades found")).toBeInTheDocument();
  });
});
