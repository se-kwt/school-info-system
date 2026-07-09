// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentsView } from "../src/components/school-setup/StudentsView";

const students = [
  {
    id: 1,
    name: "Existing Student",
    admissionNo: "SCH-1",
    rollNumber: "5",
    photoUrl: null,
    status: "active" as const,
    class: { name: "Grade 5", section: "A" },
    parents: [],
  },
];
const classes = [{ id: 1, name: "Grade 5", section: "A" }];

describe("StudentsView roll number & photo", () => {
  afterEach(() => cleanup());

  it("shows the roll number column for an existing student", () => {
    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("uploads the selected photo first, then includes the returned photoUrl in the create request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ photoUrl: "/uploads/students/abc.png" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 2, name: "New Student", admissionNo: "SCH-2" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(students), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={[]} classes={classes} isAdmin={true} />);

    await userEvent.type(screen.getByLabelText("Student name"), "New Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-2");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Student photo"), file);

    await userEvent.click(screen.getByRole("button", { name: "Create Student" }));

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

  it("pre-fills the roll number when starting an edit and submits it on save", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentsView initialStudents={students} classes={classes} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const rollNumberInput = screen.getByLabelText("Edit roll number for Existing Student") as HTMLInputElement;
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
});
