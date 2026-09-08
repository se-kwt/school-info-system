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

const academicYears = [{ id: 1, name: "2026-27" }];

describe("FacultyAssignmentClassesView", () => {
  afterEach(() => cleanup());

  it("renders a card per class linking to its faculty assignment page, with enrollment", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toHaveAttribute(
      "href",
      "/dashboard/faculty-assignment/1"
    );
    expect(screen.getByText("25 / 30")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("does not render an actions menu on class cards", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />);
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Search classes..."), "Section A");
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 2 · Section B" })).not.toBeInTheDocument();
  });

  it("switches to list view and shows the same classes in a table", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Grade 1" })).toBeInTheDocument();
  });

  it("shows an empty state when no classes match the search", async () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Search classes..."), "nonexistent");
    expect(screen.getByText("No classes found")).toBeInTheDocument();
  });

  it("shows the academic year name on each card", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />);
    expect(screen.getAllByText("2026-27")).toHaveLength(classes.length);
  });

  it("distinguishes identically-named grade/section cards from different academic years", () => {
    const twoYears = [
      { id: 1, name: "2025-26" },
      { id: 2, name: "2026-27" },
    ];
    const sameNameClasses = [
      { id: 10, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 1, archived: false, capacity: 30, room: null, enrolledCount: 25 },
      { id: 20, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 2, archived: false, capacity: 30, room: null, enrolledCount: 10 },
    ];

    render(<FacultyAssignmentClassesView initialClasses={sameNameClasses} academicYears={twoYears} />);

    expect(screen.getByText("2025-26")).toBeInTheDocument();
    expect(screen.getByText("2026-27")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Grade 1 · Section A" });
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard/faculty-assignment/10",
      "/dashboard/faculty-assignment/20",
    ]);
  });
});
