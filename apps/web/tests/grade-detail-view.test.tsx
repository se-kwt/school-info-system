// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradeDetailView } from "../src/components/school-setup/GradeDetailView";

const subjects = [
  { id: 1, name: "Mathematics", gradeId: 1, versionCount: 2 },
  { id: 2, name: "English", gradeId: 1, versionCount: 0 },
];

describe("GradeDetailView", () => {
  afterEach(() => cleanup());

  it("renders a back link to Grades and a card per subject with its syllabus version count", () => {
    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    expect(screen.getByRole("link", { name: /subjects/i })).toHaveAttribute("href", "/dashboard/subjects");
    expect(screen.getByRole("link", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByText("2 syllabus versions")).toBeInTheDocument();
    expect(screen.getByText("0 syllabus versions")).toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    await userEvent.type(screen.getByLabelText("Search subjects..."), "Math");
    expect(screen.getByRole("link", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "English" })).not.toBeInTheDocument();
  });

  it("adds a subject through the modal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "Science", gradeId: 1, versionCount: 0 }), { status: 201 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([...subjects, { id: 3, name: "Science", gradeId: 1, versionCount: 0 }]), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add Subject" }));
    await userEvent.type(screen.getByLabelText("Subject name"), "Science");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("link", { name: "Science" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows the delete-blocked banner in place of the footer on a deletable:false response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "This subject has syllabus, faculty, or scheduling history and cannot be deleted",
          deletable: false,
        }),
        { status: 400 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    const mathCard = screen.getByRole("link", { name: "Mathematics" }).closest("div")!.parentElement!;
    await userEvent.click(within(mathCard).getByRole("button", { name: "Actions for Mathematics" }));
    await userEvent.click(within(mathCard).getByText("Delete"));

    expect(
      await within(mathCard).findByText("This subject has syllabus, faculty, or scheduling history and cannot be deleted")
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("sends the subject metadata on create", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 3,
            name: "Physics",
            gradeId: 1,
            versionCount: 0,
            code: "PHY-101",
            creditHours: null,
            weeklyPeriods: 5,
            isPractical: false,
            isElective: true,
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(subjects), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add Subject" }));
    await userEvent.type(screen.getByLabelText("Subject name"), "Physics");
    await userEvent.type(screen.getByLabelText("Subject code"), "PHY-101");
    await userEvent.type(screen.getByLabelText("Weekly periods"), "5");
    await userEvent.click(screen.getByLabelText("Elective"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.code).toBe("PHY-101");
    expect(body.weeklyPeriods).toBe(5);
    expect(body.isElective).toBe(true);
    vi.unstubAllGlobals();
  });

  it("shows an elective badge on elective subjects", () => {
    const withElective = [
      ...subjects,
      { id: 3, name: "Music", gradeId: 1, versionCount: 0, isElective: true },
    ];
    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={withElective} />);
    const musicCard = screen.getByRole("link", { name: "Music" }).closest("div")!.parentElement!;
    expect(within(musicCard).getByText("Elective")).toBeInTheDocument();
    const mathCard = screen.getByRole("link", { name: "Mathematics" }).closest("div")!.parentElement!;
    expect(within(mathCard).queryByText("Elective")).not.toBeInTheDocument();
  });

  it("switches to list view and shows the same subjects in a table", async () => {
    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Mathematics" })).toBeInTheDocument();
  });

  it("surfaces a non-blocked delete failure as a visible top-level error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Something went wrong deleting the subject" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GradeDetailView gradeId={1} gradeName="Grade 1" initialSubjects={subjects} />);
    const mathCard = screen.getByRole("link", { name: "Mathematics" }).closest("div")!.parentElement!;
    await userEvent.click(within(mathCard).getByRole("button", { name: "Actions for Mathematics" }));
    await userEvent.click(within(mathCard).getByText("Delete"));

    expect(await screen.findByText("Something went wrong deleting the subject")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
