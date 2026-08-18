// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClassesView } from "../src/components/school-setup/ClassesView";

const grades = [{ id: 1, name: "Grade 1" }];
const academicYears = [{ id: 1, name: "2026-27" }];

const classes = [
  { id: 1, gradeId: 1, gradeName: "Grade 1", section: "A", academicYearId: 1, archived: false },
  { id: 2, gradeId: 1, gradeName: "Grade 1", section: "B", academicYearId: 1, archived: true },
];

describe("ClassesView", () => {
  afterEach(() => cleanup());

  it("renders a card per class with the grade/section title and year subtitle", () => {
    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.getAllByText("2026-27", { ignore: "option" })).toHaveLength(2);
  });

  it("shows an Archived badge only on archived classes", () => {
    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    expect(screen.getAllByText("Archived")).toHaveLength(1);
  });

  it("filters cards by the search box", async () => {
    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Search classes..."), "Section A");
    expect(screen.getByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 1 · Section B" })).not.toBeInTheDocument();
  });

  it("offers Archive instead when a delete is blocked", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "This class has enrollment or scheduling history and cannot be deleted", deletable: false }),
        { status: 400 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    const card = screen.getByRole("link", { name: "Grade 1 · Section A" }).closest("div")!.parentElement!;
    await userEvent.click(within(card).getByRole("button", { name: "Actions for Grade 1 · Section A" }));
    await userEvent.click(within(card).getByText("Delete"));

    expect(await within(card).findByRole("button", { name: "Archive instead" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("switches to list view and shows the same classes in a table", async () => {
    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "Grade 1" })).toHaveLength(2);
  });

  it("surfaces a non-blocked delete failure as a visible top-level error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Something went wrong deleting the class" }), { status: 403 })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ClassesView initialClasses={classes} grades={grades} academicYears={academicYears} />);
    const card = screen.getByRole("link", { name: "Grade 1 · Section A" }).closest("div")!.parentElement!;
    await userEvent.click(within(card).getByRole("button", { name: "Actions for Grade 1 · Section A" }));
    await userEvent.click(within(card).getByText("Delete"));

    expect(await screen.findByText("Something went wrong deleting the class")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("clamps to a valid page after deleting the last item on the final page", async () => {
    const manyClasses = Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      gradeId: 1,
      gradeName: "Grade 1",
      section: String.fromCharCode(65 + index),
      academicYearId: 1,
      archived: false,
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(manyClasses.slice(0, 8)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClassesView initialClasses={manyClasses} grades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("link", { name: "Grade 1 · Section I" })).toBeInTheDocument();

    const lastCard = screen.getByRole("link", { name: "Grade 1 · Section I" }).closest("div")!.parentElement!;
    await userEvent.click(within(lastCard).getByRole("button", { name: "Actions for Grade 1 · Section I" }));
    await userEvent.click(within(lastCard).getByText("Delete"));

    expect(await screen.findByRole("link", { name: "Grade 1 · Section A" })).toBeInTheDocument();
    expect(screen.queryByText("No classes found")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
