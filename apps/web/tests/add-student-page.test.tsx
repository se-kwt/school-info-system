// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AddStudentPage } from "../src/components/school-setup/AddStudentPage";

const classes = [
  { id: 1, gradeName: "Grade 5", section: "A" },
  { id: 2, gradeName: "Grade 6", section: "B" },
];
const allStudents: never[] = [];

describe("AddStudentPage", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("uploads the selected photo first, then includes the returned photoUrl in the create request, and redirects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ photoUrl: "/uploads/students/abc.png" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Student", admissionNo: "SCH-3" }), { status: 201 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStudentPage classes={classes} allStudents={allStudents} />);

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
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/students/upload-photo", expect.objectContaining({ method: "POST" }));
    });
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.photoUrl).toBe("/uploads/students/abc.png");
    expect(secondCallBody.rollNumber).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/dashboard/students");
  });

  it("sends every admission field on create", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStudentPage classes={classes} allStudents={allStudents} />);

    await userEvent.type(screen.getByLabelText(/^first name/i), "New");
    await userEvent.type(screen.getByLabelText(/^last name/i), "Student");
    await userEvent.type(screen.getByLabelText(/date of birth/i), "2015-01-01");
    await userEvent.type(screen.getByLabelText(/admission number/i), "NEW-001");
    await userEvent.type(screen.getByLabelText(/^address/i), "12 Example Road");
    await userEvent.type(screen.getByLabelText(/blood group/i), "O+");
    await userEvent.type(screen.getByLabelText(/emergency contact name/i), "Aunt");
    await userEvent.type(screen.getByLabelText(/emergency contact phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/previous school/i), "Little Flower LP");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.address).toBe("12 Example Road");
    expect(body.bloodGroup).toBe("O+");
    expect(body.emergencyContactName).toBe("Aunt");
    expect(body.emergencyContactPhone).toBe("+919876543210");
    expect(body.previousSchool).toBe("Little Flower LP");
  });

  it("offers a third gender option", () => {
    render(<AddStudentPage classes={classes} allStudents={allStudents} />);
    const select = screen.getByLabelText(/gender/i);
    const options = within(select).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(expect.arrayContaining(["male", "female", "other"]));
  });

  it("offers guardian relationship as a fixed list, not free text", async () => {
    render(<AddStudentPage classes={classes} allStudents={allStudents} />);
    await userEvent.click(screen.getByRole("button", { name: /add parent/i }));
    const select = screen.getByLabelText(/relationship/i);
    expect(select.tagName).toBe("SELECT");
    const options = within(select).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(expect.arrayContaining(["father", "mother", "guardian", "grandparent", "sibling", "other"]));
  });
});
