// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentsView } from "../src/components/school-setup/StudentsView";

const classes = [
  { id: 1, gradeName: "Grade 5", section: "A" },
  { id: 2, gradeName: "Grade 6", section: "B" },
];

const students = [
  {
    id: 1,
    name: "Existing Student",
    dob: "2010-01-01",
    admissionNo: "SCH-1",
    rollNumber: "5",
    photoUrl: null,
    status: "active" as const,
    gender: null as null,
    studentIdNumber: null as null,
    dateOfJoin: null as null,
    classId: 1,
    class: { gradeName: "Grade 5", section: "A" },
    parents: [] as { relationship: string; name: string; phone: string; email: string | null }[],
    siblings: [] as { id: number; name: string; admissionNo: string; gender: "male" | "female" | null; class: { gradeName: string; section: string } | null }[],
  },
  {
    id: 2,
    name: "Other Class Student",
    dob: "2010-06-15",
    admissionNo: "SCH-2",
    rollNumber: "1",
    photoUrl: null,
    status: "active" as const,
    gender: null as null,
    studentIdNumber: null as null,
    dateOfJoin: null as null,
    classId: 2,
    class: { gradeName: "Grade 6", section: "B" },
    parents: [] as { relationship: string; name: string; phone: string; email: string | null }[],
    siblings: [] as { id: number; name: string; admissionNo: string; gender: "male" | "female" | null; class: { gradeName: string; section: string } | null }[],
  },
];

describe("StudentsView", () => {
  afterEach(() => cleanup());

  it("shows all students by default", () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    expect(screen.getByText("Existing Student")).toBeInTheDocument();
    expect(screen.getByText("Other Class Student")).toBeInTheDocument();
  });

  it("filters the grid by the selected class", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by class"), "1");
    expect(screen.getByText("Existing Student")).toBeInTheDocument();
    expect(screen.queryByText("Other Class Student")).not.toBeInTheDocument();
  });

  it("filters by class id, so identically-named classes stay distinct", async () => {
    const sameNameClasses = [
      { id: 10, gradeName: "Grade 5", section: "A" },
      { id: 20, gradeName: "Grade 5", section: "A" },
    ];
    const sameNameStudents = [
      {
        ...students[0],
        id: 3,
        name: "Current Year Student",
        classId: 10,
        class: { gradeName: "Grade 5", section: "A" },
      },
      {
        ...students[0],
        id: 4,
        name: "Prior Year Student",
        classId: 20,
        class: { gradeName: "Grade 5", section: "A" },
      },
    ];

    render(<StudentsView initialStudents={sameNameStudents} classes={sameNameClasses} isAdmin={true} />);

    await userEvent.selectOptions(screen.getByLabelText(/filter by class/i), "10");

    expect(screen.getByText("Current Year Student")).toBeInTheDocument();
    expect(screen.queryByText("Prior Year Student")).toBeNull();
  });

  it("pre-fills the roll number when opening an existing card and submits it on save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(students), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: /Existing Student/ }));

    const rollNumberInput = screen.getByLabelText("Roll number") as HTMLInputElement;
    expect(rollNumberInput.value).toBe("5");

    await userEvent.clear(rollNumberInput);
    await userEvent.type(rollNumberInput, "9");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/students/1", expect.objectContaining({ method: "PATCH" }));
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.rollNumber).toBe("9");
  });

  it("pre-fills the date of birth when editing an existing student", async () => {
    const studentsWithDob = [
      {
        ...students[0],
        dob: "2015-03-14",
      },
    ];

    render(<StudentsView initialStudents={studentsWithDob} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: /Existing Student/ }));

    expect(screen.getByLabelText(/date of birth/i)).toHaveValue("2015-03-14");
  });

  it("links Add new student to the dedicated Add Student page", () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    expect(screen.getByRole("link", { name: "Add new student" })).toHaveAttribute("href", "/dashboard/students/add");
  });

  it("non-admin can open a card but sees no Save button", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={false} />);
    expect(screen.queryByRole("link", { name: "Add new student" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Existing Student/ }));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("filters the student list by search term", async () => {
    const searchStudents = [
      { ...students[0], id: 1, name: "Anita Menon", admissionNo: "ADM-001" },
      { ...students[1], id: 2, name: "Bhavesh Kumar", admissionNo: "ADM-777" },
    ];
    render(<StudentsView initialStudents={searchStudents} classes={classes} isAdmin={true} />);

    await userEvent.type(screen.getByLabelText(/search/i), "anita");

    expect(screen.getByText("Anita Menon")).toBeInTheDocument();
    expect(screen.queryByText("Bhavesh Kumar")).toBeNull();
  });

  it("searches admission number as well as name", async () => {
    const searchStudents = [
      { ...students[0], id: 1, name: "Anita Menon", admissionNo: "ADM-001" },
      { ...students[1], id: 2, name: "Bhavesh Kumar", admissionNo: "ADM-777" },
    ];
    render(<StudentsView initialStudents={searchStudents} classes={classes} isAdmin={true} />);

    await userEvent.type(screen.getByLabelText(/search/i), "ADM-777");

    expect(screen.getByText("Bhavesh Kumar")).toBeInTheDocument();
    expect(screen.queryByText("Anita Menon")).toBeNull();
  });

  it("paginates a long list", async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      ...students[0],
      id: i + 1,
      name: `Student ${i + 1}`,
      admissionNo: `A${i + 1}`,
      classId: 1,
      class: { gradeName: "Grade 5", section: "A" },
    }));

    render(<StudentsView initialStudents={many} classes={classes} isAdmin={true} />);

    expect(screen.queryByText("Student 9")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Student 9")).toBeInTheDocument();
  });

  it("returns to the first page when the search changes", async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      ...students[0],
      id: i + 1,
      name: `Student ${i + 1}`,
      admissionNo: `A${i + 1}`,
      classId: 1,
      class: { gradeName: "Grade 5", section: "A" },
    }));

    render(<StudentsView initialStudents={many} classes={classes} isAdmin={true} />);

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await userEvent.type(screen.getByLabelText(/search/i), "Student 1");

    expect(screen.getByText("Student 1")).toBeInTheDocument();
  });

  it("switches to a real list-table view when List is clicked", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);

    expect(screen.queryByRole("table")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /list view/i }));

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(within(table).getByText("Existing Student")).toBeInTheDocument();
    expect(within(table).getByText("Other Class Student")).toBeInTheDocument();
    expect(within(table).getByText("SCH-1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /grid view/i }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Existing Student")).toBeInTheDocument();
  });

  it("offers Deactivate without a failed delete first", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);

    await userEvent.click(screen.getByRole("button", { name: /Existing Student/ }));

    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("offers Activate instead for an inactive student", async () => {
    const inactiveStudents = [{ ...students[0], id: 5, name: "Former Student", status: "inactive" as const }];
    render(<StudentsView initialStudents={inactiveStudents} classes={classes} isAdmin={true} />);

    await userEvent.click(screen.getByRole("button", { name: /Former Student/ }));

    expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });

  it("shows exactly one Deactivate button after a blocked delete, not a duplicate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "blocked", deletable: false }), { status: 400 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: /Existing Student/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/has recorded history/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate instead" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Deactivate" })).toHaveLength(1);
  });
});
