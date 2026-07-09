// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffCard } from "../src/components/school-setup/StaffCard";

describe("StaffCard", () => {
  afterEach(() => cleanup());

  const teacher = {
    id: 1,
    name: "Jane Teacher",
    phone: "+15550001111",
    role: "teacher" as const,
    status: "active" as const,
    classAssignment: { className: "Grade 5", section: "A", subject: "Math" },
  };

  it("renders the name and capitalized role", () => {
    render(<StaffCard member={teacher} onClick={() => {}} />);
    expect(screen.getByText("Jane Teacher")).toBeInTheDocument();
    expect(screen.getByText("teacher")).toBeInTheDocument();
  });

  it("renders the class assignment line for a teacher with an assignment", () => {
    render(<StaffCard member={teacher} onClick={() => {}} />);
    expect(screen.getByText("Grade 5 A · Math")).toBeInTheDocument();
  });

  it("omits the class assignment line when there is none", () => {
    render(<StaffCard member={{ ...teacher, classAssignment: null }} onClick={() => {}} />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("shows an Inactive badge when status is inactive", () => {
    render(<StaffCard member={{ ...teacher, status: "inactive" }} onClick={() => {}} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("does not show an Inactive badge when status is active", () => {
    render(<StaffCard member={teacher} onClick={() => {}} />);
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<StaffCard member={teacher} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Jane Teacher/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
