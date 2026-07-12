// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentsView } from "../src/components/school-setup/StudentsView";

const classes = [
  { id: 1, name: "Grade 5", section: "A" },
  { id: 2, name: "Grade 6", section: "B" },
];

const students = [
  {
    id: 1,
    name: "Existing Student",
    admissionNo: "SCH-1",
    rollNumber: "5",
    photoUrl: null,
    status: "active" as const,
    gender: null as null,
    studentIdNumber: null as null,
    dateOfJoin: null as null,
    class: { name: "Grade 5", section: "A" },
    parents: [] as { relationship: string; name: string; phone: string; email: string | null }[],
    siblings: [] as { id: number; name: string; admissionNo: string; gender: "male" | "female" | null; class: { name: string; section: string } | null }[],
  },
  {
    id: 2,
    name: "Other Class Student",
    admissionNo: "SCH-2",
    rollNumber: "1",
    photoUrl: null,
    status: "active" as const,
    gender: null as null,
    studentIdNumber: null as null,
    dateOfJoin: null as null,
    class: { name: "Grade 6", section: "B" },
    parents: [] as { relationship: string; name: string; phone: string; email: string | null }[],
    siblings: [] as { id: number; name: string; admissionNo: string; gender: "male" | "female" | null; class: { name: string; section: string } | null }[],
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

  it("uploads the selected photo first, then includes the returned photoUrl in the create request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ photoUrl: "/uploads/students/abc.png" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Student", admissionNo: "SCH-3" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(students), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={[]} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: "Add new student" }));

    await userEvent.type(screen.getByLabelText("First name"), "New");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-3");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Add parent" }));
    await userEvent.type(screen.getByLabelText("Parent 1 first name"), "A");
    await userEvent.type(screen.getByLabelText("Parent 1 last name"), "Parent");
    await userEvent.type(screen.getByLabelText("Parent 1 mobile number"), "+15550009999");

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Photo"), file);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "/api/students/upload-photo",
        expect.objectContaining({ method: "POST" })
      );
    });
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.photoUrl).toBe("/uploads/students/abc.png");
    expect(secondCallBody.rollNumber).toBe("1");
  });

  it("pre-fills the selected class filter into the create modal", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by class"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Add new student" }));
    expect((screen.getByLabelText("Class") as HTMLSelectElement).value).toBe("2");
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

  it("non-admin can open a card but sees no Save button", async () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: "Add new student" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Existing Student/ }));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
