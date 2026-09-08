// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FacultyAssignmentClassesView } from "../src/components/school-setup/FacultyAssignmentClassesView";

const classes = [
  { id: 1, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 1, archived: false, capacity: 30, room: null, enrolledCount: 25 },
  { id: 2, gradeId: 2, gradeName: "Grade 2", section: "B", academicYearId: 1, archived: false, capacity: null, room: null, enrolledCount: 20 },
];

describe("FacultyAssignmentClassesView", () => {
  afterEach(() => cleanup());

  it("renders a card per class linking to its faculty assignment page, with enrollment", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toHaveAttribute(
      "href",
      "/dashboard/faculty-assignment/1"
    );
    expect(screen.getByText("25 / 30")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("does not render an actions menu on class cards", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    await userEvent.type(screen.getByLabelText("Search classes..."), "Section A");
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 2 · Section B" })).not.toBeInTheDocument();
  });

  it("switches to list view and shows the same classes in a table", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Grade 1" })).toBeInTheDocument();
  });

  it("shows an empty state when no classes match the search", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} />);
    await userEvent.type(screen.getByLabelText("Search classes..."), "nonexistent");
    expect(screen.getByText("No classes found")).toBeInTheDocument();
  });
});
