// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentCard } from "../src/components/school-setup/StudentCard";

describe("StudentCard", () => {
  afterEach(() => cleanup());

  const student = {
    id: 1,
    name: "Rohan Sharma",
    admissionNo: "SCH-1",
    rollNumber: "5",
    photoUrl: null,
    status: "active" as const,
    gender: null,
    studentIdNumber: null,
    dateOfJoin: null,
    class: { name: "Grade 5", section: "A" },
    parents: [],
    siblings: [],
  };

  it("renders the name, roll number, and class", () => {
    render(<StudentCard student={student} onClick={() => {}} />);
    expect(screen.getByText("Rohan Sharma")).toBeInTheDocument();
    expect(screen.getByText("Roll No. 5")).toBeInTheDocument();
    expect(screen.getByText("Grade 5 A")).toBeInTheDocument();
  });

  it("renders initials when there is no photo", () => {
    render(<StudentCard student={student} onClick={() => {}} />);
    expect(screen.getByText("RS")).toBeInTheDocument();
  });

  it("renders a photo image when photoUrl is set", () => {
    render(<StudentCard student={{ ...student, photoUrl: "/uploads/students/a.png" }} onClick={() => {}} />);
    expect(screen.getByAltText("Rohan Sharma")).toHaveAttribute("src", "/uploads/students/a.png");
  });

  it("shows a status badge when not active", () => {
    render(<StudentCard student={{ ...student, status: "inactive" }} onClick={() => {}} />);
    expect(screen.getByText("inactive")).toBeInTheDocument();
  });

  it("does not show a status badge when active", () => {
    render(<StudentCard student={student} onClick={() => {}} />);
    expect(screen.queryByText("active")).not.toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<StudentCard student={student} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Rohan Sharma/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
