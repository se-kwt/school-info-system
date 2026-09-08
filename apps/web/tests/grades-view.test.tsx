// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradesView } from "../src/components/school-setup/GradesView";

const academicYears = [{ id: 1, name: "2026-27", status: "active" as const }];

const grades = [
  { id: 1, name: "Grade 1", subjectCount: 2, classCount: 2, subjectNames: ["English", "Math"] },
  { id: 2, name: "Grade 2", subjectCount: 0, classCount: 0, subjectNames: [] },
];

describe("GradesView", () => {
  afterEach(() => cleanup());

  it("renders a card per grade with subject names and class count badge", () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    expect(screen.getByText("Grade 1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 1" })).not.toBeInTheDocument();
    expect(screen.getByText("English, Math")).toBeInTheDocument();
    expect(screen.getByText("No subjects yet")).toBeInTheDocument();
    expect(screen.getByText("Classes 2")).toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Search grades..."), "Grade 1");
    expect(screen.getByText("Grade 1")).toBeInTheDocument();
    expect(screen.queryByText("Grade 2")).not.toBeInTheDocument();
  });

  it("links Create Grade to the dedicated Add Grade page", () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "+ Create Grade" })).toHaveAttribute("href", "/dashboard/grades/add");
  });

  it("shows the delete-blocked banner in place of the footer on a 400 deletable:false response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "This grade has subjects or classes and cannot be deleted", deletable: false }), {
        status: 400,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    const grade1Card = screen.getByText("Grade 1").closest("div")!.parentElement!;
    await userEvent.click(within(grade1Card).getByRole("button", { name: "Actions for Grade 1" }));
    await userEvent.click(within(grade1Card).getByText("Delete"));

    expect(
      await within(grade1Card).findByText("Grade 1 has subjects or classes and cannot be deleted.")
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("switches to list view and shows the same grades in a table", async () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Grade 1" })).toBeInTheDocument();
  });

  it("surfaces a non-blocked delete failure as a visible top-level error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Something went wrong deleting the grade" }), { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    const grade1Card = screen.getByText("Grade 1").closest("div")!.parentElement!;
    await userEvent.click(within(grade1Card).getByRole("button", { name: "Actions for Grade 1" }));
    await userEvent.click(within(grade1Card).getByText("Delete"));

    expect(await screen.findByText("Something went wrong deleting the grade")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("clamps to a valid page after deleting the last item on the final page", async () => {
    const manyGrades = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      name: `Grade ${index + 1}`,
      subjectCount: 0,
      classCount: 0,
      subjectNames: [],
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(manyGrades.slice(0, 8)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={manyGrades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Grade 9")).toBeInTheDocument();

    const grade9Card = screen.getByText("Grade 9").closest("div")!.parentElement!;
    await userEvent.click(within(grade9Card).getByRole("button", { name: "Actions for Grade 9" }));
    await userEvent.click(within(grade9Card).getByText("Delete"));

    expect(await screen.findByText("Grade 1")).toBeInTheDocument();
    expect(screen.queryByText("No grades found")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("defaults the year filter to the active academic year", () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("1");
  });

  it("falls back to All Years when no academic year is active", () => {
    const noActiveYear = [{ id: 1, name: "2026-27", status: "upcoming" as const }];
    render(<GradesView initialGrades={grades} academicYears={noActiveYear} />);
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("all");
  });
});
