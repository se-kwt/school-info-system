// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradesView } from "../src/components/school-setup/GradesView";

const academicYears = [{ id: 1, name: "2026-27" }];

const grades = [
  { id: 1, name: "Grade 1", subjectCount: 2, classCount: 2, subjectNames: ["English", "Math"] },
  { id: 2, name: "Grade 2", subjectCount: 0, classCount: 0, subjectNames: [] },
];

describe("GradesView", () => {
  afterEach(() => cleanup());

  it("renders a card per grade with subject names and class count badge", () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    expect(screen.getByRole("link", { name: "Grade 1" })).toBeInTheDocument();
    expect(screen.getByText("English, Math")).toBeInTheDocument();
    expect(screen.getByText("No subjects yet")).toBeInTheDocument();
    expect(screen.getByText("Classes 2")).toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Search grades..."), "Grade 1");
    expect(screen.getByRole("link", { name: "Grade 1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grade 2" })).not.toBeInTheDocument();
  });

  it("creates a grade through the modal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 3, name: "Grade 3" }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([...grades, { id: 3, name: "Grade 3", subjectCount: 0, classCount: 0, subjectNames: [] }]), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Create Grade" }));
    await userEvent.type(screen.getByLabelText("Grade name"), "Grade 3");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("link", { name: "Grade 3" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows the delete-blocked banner in place of the footer on a 400 deletable:false response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "This grade has subjects or classes and cannot be deleted", deletable: false }), {
        status: 400,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradesView initialGrades={grades} academicYears={academicYears} />);
    const grade1Card = screen.getByRole("link", { name: "Grade 1" }).closest("div")!.parentElement!;
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
});
