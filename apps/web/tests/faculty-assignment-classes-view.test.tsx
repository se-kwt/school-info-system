// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FacultyAssignmentClassesView } from "../src/components/school-setup/FacultyAssignmentClassesView";

const classes = [
  { id: 1, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 1, archived: false, capacity: 30, room: null, enrolledCount: 25 },
  { id: 2, gradeId: 2, gradeName: "Grade 2", section: "B", academicYearId: 1, archived: false, capacity: null, room: null, enrolledCount: 20 },
];

const academicYears = [{ id: 1, name: "2026-27", status: "active" as const }];

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
    expect(screen.getAllByText("2026-27", { ignore: "option" })).toHaveLength(classes.length);
  });

  it("distinguishes identically-named grade/section cards from different academic years", () => {
    const twoYears = [
      { id: 1, name: "2025-26", status: "archived" as const },
      { id: 2, name: "2026-27", status: "active" as const },
    ];
    const sameNameClasses = [
      { id: 10, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 1, archived: false, capacity: 30, room: null, enrolledCount: 25 },
      { id: 20, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 2, archived: false, capacity: 30, room: null, enrolledCount: 10 },
    ];

    render(<FacultyAssignmentClassesView initialClasses={sameNameClasses} academicYears={twoYears} />);

    expect(screen.getByText("2025-26", { ignore: "option" })).toBeInTheDocument();
    expect(screen.getByText("2026-27", { ignore: "option" })).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Grade 1 · Section A" });
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard/faculty-assignment/10",
      "/dashboard/faculty-assignment/20",
    ]);
  });

  it("defaults the year filter to the active academic year", () => {
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={academicYears} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("1");
  });

  it("falls back to All Years when no academic year is active", () => {
    const noActiveYear = [{ id: 1, name: "2026-27", status: "upcoming" as const }];
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={noActiveYear} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("all");
  });

  it("refetches classes scoped to the selected year when the filter changes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 30,
            gradeId: 1,
            gradeName: "Grade 1",
            section: "C",
            academicYearId: 2,
            archived: false,
            capacity: 30,
            room: null,
            enrolledCount: 5,
          },
        ]),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const twoYears = [
      { id: 1, name: "2025-26", status: "active" as const },
      { id: 2, name: "2026-27", status: "upcoming" as const },
    ];
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={twoYears} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by academic year"), "2");

    expect(fetchMock).toHaveBeenCalledWith("/api/classes?academicYearId=2");
    expect(await screen.findByRole("link", { name: "Grade 1 · Section C" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("does not crash or replace displayed classes when the refetch response is not OK", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const twoYears = [
      { id: 1, name: "2025-26", status: "active" as const },
      { id: 2, name: "2026-27", status: "upcoming" as const },
    ];
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={twoYears} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by academic year"), "2");

    expect(fetchMock).toHaveBeenCalledWith("/api/classes?academicYearId=2");
    // The bad response must never be applied to state: the original classes should still render.
    expect(await screen.findByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grade 2 · Section B" })).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("applies only the latest-issued request's response when requests race", async () => {
    const firstYearClasses = [
      {
        id: 40,
        gradeId: 1,
        gradeName: "Grade 1",
        section: "Stale",
        academicYearId: 2,
        archived: false,
        capacity: 30,
        room: null,
        enrolledCount: 5,
      },
    ];
    const secondYearClasses = [
      {
        id: 50,
        gradeId: 1,
        gradeName: "Grade 1",
        section: "Fresh",
        academicYearId: 3,
        archived: false,
        capacity: 30,
        room: null,
        enrolledCount: 5,
      },
    ];

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(new Response(JSON.stringify(firstYearClasses), { status: 200 })), 50)
          )
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(new Response(JSON.stringify(secondYearClasses), { status: 200 })), 0)
          )
      );
    vi.stubGlobal("fetch", fetchMock);

    const threeYears = [
      { id: 1, name: "2024-25", status: "active" as const },
      { id: 2, name: "2025-26", status: "upcoming" as const },
      { id: 3, name: "2026-27", status: "upcoming" as const },
    ];
    render(<FacultyAssignmentClassesView initialClasses={classes} academicYears={threeYears} />);

    // Fire the first (slower-resolving) request, then immediately the second (faster-resolving,
    // later-issued) request, before the first has resolved.
    await userEvent.selectOptions(screen.getByLabelText("Filter by academic year"), "2");
    await userEvent.selectOptions(screen.getByLabelText("Filter by academic year"), "3");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("link", { name: "Grade 1 · Section Fresh" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 1 · Section Stale" })).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
